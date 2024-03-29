const items_div = document.getElementById('items_div');
const items_ul = document.getElementById('items_ul');
const upload_div = document.getElementById('upload_div');

const elements_ul = document.getElementById('elements_ul');
const console_textarea = document.getElementById('console_textarea');

const rest_div = document.getElementById('rest_div');
const draw_div = document.getElementById('draw_div');
const frame_canvas = document.getElementById('frame_canvas');
const frame_canvas_context = frame_canvas.getContext('2d'); // 图像
const drawn_div = document.getElementById('drawn_div'); // 绘制完成
const drawing_canvas = document.getElementById('drawing_canvas');
const drawing_canvas_context = drawing_canvas.getContext('2d'); // 绘制中

const mxy_div = document.getElementById('mxy_div'); // 鼠标跟随

let name_list = [];
let now_name = "";
let item_data = {}; // 当前项目信息 name frame elements (element: {'type': 1/2/3, 'points': [[x0, y0], ...]})

let resize_rate = 1; // 当前图像计算出的缩放率

let type = -1; // 当前的绘制类别
let type_map = {1: '多边形', 2: '矩形', 3: '线段'};
let points = []; // 当前的绘制点集合
let mx = 0; let my = 0; // 正在移动的鼠标位置

let history = []; // 记录历史操作 [{"action": -1, "type": -1, "points": -1}, ...] action 0:删除 1:新增

function print(info, flush) {
    if (flush) {
        console_textarea.value = info;
    } else {
        console_textarea.value += info + "\n";
    }
    console_textarea.scrollTop = console_textarea.scrollHeight;
}

function loadItems() { // 加载项目列表
    fetch('/items')
        .then(response => response.json())
        .then(items_list => {
            // 清空 items_ul 内部所有元素后将 name 添加进 items_ul
            items_ul.innerHTML = ''; 
            name_list = [];
            items_list.forEach(name => {
                name_list.push(name);
                let item_li = document.createElement('li'); // 创建项目名称li标签
                item_li.textContent = name;
                item_li.addEventListener('click', () => {loadItem(name);});
                let item_button = document.createElement('button'); // 创建删除按钮
                item_button.textContent = 'delete';
                item_button.addEventListener('click', (event) => {event.stopPropagation(); deleteItem(name);})
                item_li.appendChild(item_button);
                items_ul.appendChild(item_li);
            });
            if (name_list.length != 0) {loadItem(name_list[0]);} // 自动加载第一个项目
            print(`获取到项目列表：${JSON.stringify(items_list)}`, false);
        })
        .catch(error => {
            print(`获取项目列表失败：${error}`, false);
        });
}
function loadItem(name) { // 加载项目 loadItem --> loadFrame --> loadElements
    fetch(`/item?name=${name}`)
        .then(response => response.json())
        .then(data => {
            item_data = data;
            now_name = name;
            history = []; // 清空历史记录
            print(`当前加载项目：${name}`, false);
            loadFrame(); // 显示图像
        })
        .catch(error => {
            print(`加载项目失败：${error}`, false);
        });
}
function loadFrame() {
    let frame_b64 = item_data['frame']; // data:image;base64,...

    let frame_img = new Image();
    frame_img.src = frame_b64;
    frame_img.onload = function() {
        let input_width = frame_img.width;
        let input_height = frame_img.height; // 原图长宽
        let output_wh = Math.min(draw_div.clientWidth, draw_div.clientHeight);
        draw_div.style.width = output_wh;
        draw_div.style.height = output_wh;

        // 归一化到目标尺寸（如果不需要归一化则保持不变）
        if (input_width > output_wh || input_height > output_wh) {
            resize_rate = output_wh / Math.max(input_width, input_height);
        } else {
            resize_rate = 1;
        }
        // 清空画板并绘图
        frame_canvas.width = input_width * resize_rate;
        frame_canvas.height = input_height * resize_rate;
        frame_canvas_context.clearRect(0, 0, output_wh, output_wh);
        frame_canvas_context.drawImage(frame_img, 0, 0, frame_canvas.width, frame_canvas.height);
        print(`项目图像加载成功：图像分辨率：${input_width}*${input_height}；缩放比例：${resize_rate}`, false);
        // 加载绘制元素
        loadElements();
    }
}
function loadElements() {
    // 展开绘制图层到图像尺寸
    drawing_canvas.width = frame_canvas.width;
    drawing_canvas.height = frame_canvas.height;
    // 加载元素
    let elements = item_data['elements'];
    elements_ul.innerHTML = '';
    drawn_div.innerHTML = '';
    elements.forEach((element, index) => {
        loadElement(element, index);
    });
}
function loadElement(element, index) {
    function showDetail(element) {
        // 显示具体坐标到 textarea
        let _type = type_map[element["type"]];
        let _points = element["points"].map(([x, y]) => [Math.floor(x / resize_rate), Math.floor(y / resize_rate)]); // 反归一化
        print(`${_type}：${JSON.stringify(_points)}`, false);
    }
    function showElement(index, element, highlight) {
        // 将元素 突出/取消突出 显示
        let context = drawn_div.querySelectorAll("canvas")[index].getContext('2d');
        if (highlight) { // 突出
            draw(element['type'], context, element['points'], 3, '#ff0000', true);
        } else { // 取消突出
            draw(element['type'], context, element['points'], 3, '#0000ff', true);
        }  
    }

    // 加载按钮
    let element_li = document.createElement('li');
    element_li.textContent = type_map[element['type']];
    element_li.addEventListener('mouseenter', () => {showElement(index, element, true);});
    element_li.addEventListener('mouseleave', () => {showElement(index, element, false);}); // 移入移出图像高亮显示
    element_li.addEventListener('click', () => {showDetail(element);}); // 点击显示点位详细信息
    let element_button = document.createElement('button');
    element_button.textContent = 'delete';
    element_button.addEventListener('click', (event) => {event.stopPropagation(); delElement(index, true)});
    element_li.appendChild(element_button);
    elements_ul.appendChild(element_li);
    // 加载图层
    drawn(element['type'], element['points'], 3, '#0000ff');
}

function addElement(_type, _points, record) { // 仅绘制结束时触发（正常触发时记录历史记录，撤销时不记录历史记录）
    // 增元素
    item_data['elements'] = item_data['elements'].concat([{type: _type, points: _points}]);
    // 前后端同步
    loadElements();
    updateItem();
    if (record) {history.push({action: 1, type: _type, points: _points});} // 历史记录
}
function delElement(index, record) { // 仅由元素删除按钮触发（正常触发时记录历史记录，撤销时不记录历史记录）
    // 删元素
    let item_deleted = item_data['elements'].splice(index, 1)[0];
    // 前后端同步
    loadElements();
    updateItem();
    if (record) {history.push({action: 0, type: item_deleted["type"], points: item_deleted["points"]});} // 历史记录
}

function draw(type, context, points, width, color, flush) {
    function drawPolygon(context, points) {
        context.beginPath();
        context.moveTo(points[0][0], points[0][1]); // 起点
        context.fillText(0, points[0][0], points[0][1]);
        for (var i=1; i<points.length; i+=1) { // 路径点
            context.lineTo(points[i][0], points[i][1]);
            if (i != points.length-1) {context.fillText(i, points[i][0], points[i][1]);}
        }
        context.stroke();
    }
    function drawRectangle(context, points) {
        context.beginPath();
        context.strokeRect(
            points[0][0], 
            points[0][1], 
            points[1][0] - points[0][0], 
            points[1][1] - points[0][1]
        );
        context.stroke();
    }
    function drawLine(context, points) {
        context.beginPath();
        context.moveTo(points[0][0], points[0][1]);
        context.lineTo(points[1][0], points[1][1]);
        context.stroke();
    }

    if (flush) {context.clearRect(0, 0, frame_canvas.width, frame_canvas.height);} // 清空绘图再绘制
    
    context.font = "bold 15px Arial";
    context.fillStyle = color; // 字体设置
    context.lineWidth = width; 
    context.strokeStyle = color; // 图形绘制设置

    if (type === 1) {drawPolygon(context, points);}
    if (type === 2) {drawRectangle(context, points);}
    if (type === 3) {drawLine(context, points);}
}
function drawn(type, points, width, color) {
    let drawn_canvas = document.createElement('canvas');
    drawn_canvas.width = frame_canvas.width;
    drawn_canvas.height = frame_canvas.height;
    drawn_canvas.style.position = 'absolute';
    drawn_div.appendChild(drawn_canvas); // 新建一个图层
    let drawn_canvas_context = drawn_canvas.getContext('2d');
    draw(type, drawn_canvas_context, points, width, color, true); // 在这个图层上绘制内容
}
function drawing(click) {
    function done() {
        // 前后端同步 addElement --> updateItem --> loadElements
        addElement(type, points, true);
        // 重置绘制
        print(`绘制已完成：${type_map[type]}`, false);
        type = -1;
        points = [];
        draw(type, drawing_canvas_context, points, 3, '#0000ff', true);
    }

    function drawingPolygon() {
        if (points.length >= 3) { // 吸附判断（超过三角形后开始吸附）
            var ending_threshold = 10;
            if (Math.abs(mx - points[0][0]) <= ending_threshold && Math.abs(my - points[0][1]) <= ending_threshold) {mx = points[0][0]; my = points[0][1];}
        }
        if (points.length >= 1) { // 绘制中
            draw(type, drawing_canvas_context, points.slice().concat([[mx, my]]), 3, '#00ff00', true);
        }
        if (click === true && points.length >= 4 &&mx === points[0][0] && my === points[0][1]) { // 绘制完成
            // 确认是由点击事件触发
            // 确认是多边形（至少四次点击，即三个角加最后一次点击收尾）
            // 确认首尾相接（即吸附成功）
            done();
        }
    }
    function drawingRectangle() {
        if (points.length == 1) { // 绘制中
            draw(type, drawing_canvas_context, points.slice().concat([[mx, my]]), 3, '#00ff00', true);
        } 
        if (click === true && points.length == 2) { // 绘制完成
            // 确认是由点击事件触发
            // 确认已经选中两个点
            done();
        }
    }
    function drawingLine() {
        if (points.length === 1) { // 绘制中
            draw(type, drawing_canvas_context, points.slice().concat([[mx, my]]), 3, '#00ff00', true);
        } 
        if (click === true && points.length === 2) { // 绘制完成
            // 确认是由点击事件触发
            // 确认已经选中两个点
            done();
        }
    }

    if (type === 1) {drawingPolygon();}
    if (type === 2) {drawingRectangle();}
    if (type === 3) {drawingLine();}
}

function uploadItem(item_data) { // 上传项目
    fetch('/upload', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(item_data)
    })
        .then(response => response.json())
        .then(data => {
            print(`项目上传成功：${item_data["name"]}`, false);
            loadItems(); 
        })
        .catch(error => {
            print(`项目上传失败：${error}`, false);
        });
}
function deleteItem(name) { // 删除项目
    fetch(`/delete?name=${name}`)
        .then(response => response.json())
        .then(data => {
            print(`项目删除成功：${name}`, false);
            loadItems(); 
        })
        .catch(error => {
            print(`项目删除失败：${error}`, false);
        });
}
function updateItem() { // 更新项目
    let item_data_new = {
        name: item_data['name'], 
        elements: item_data['elements']
    };
    fetch('/update', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(item_data_new)
    })
        .then(response => response.json())
        .then(data => {
            print(`项目更新成功：${item_data_new["name"]}`, false);
        })
        .catch(error => {
            print(`项目更新失败: ${error}`, false);
        });
}

function revoke() { // ctrl-z组合键 触发
    if (history.length === 0) {print(`已是第一步，无法撤销`);return;}

    let to_revoke = history[history.length-1]; history.pop();
    let _action = to_revoke["action"];
    let _type = to_revoke["type"];
    let _points = to_revoke["points"];

    if (_action === 1) { // 原本是添加 则现在是删除
        delElement(drawn_div.querySelectorAll('canvas').length - 1, false); // 直接倒序开始向前删除
        print(`已成功撤销绘制：${type_map[_type]}`);
    } else if (_action === 0) { // 原本是删除 则现在是添加
        addElement(_type, _points, false); // 添加回去
        print(`已成功撤销删除：${type_map[_type]}`);
    }
}
function next() { // e键 触发 
    let index = name_list.findIndex(value => value == now_name); // 当前所在index
    index = index + 1; // 下一张
    if (index >= name_list.length) {index = 0;} // 确保循环不越界
    loadItem(name_list[index]);
}
function last() { // q键 触发 
    let index = name_list.findIndex(value => value == now_name);
    index = index - 1; // 上一张
    if (index < 0) {index = name_list.length - 1;} // 确保循环不越界
    loadItem(name_list[index]);
}

function eventInit() { // 各种监听事件初始化
    // 拖拽上传事件监听
    upload_div.addEventListener('dragover', function(event) {
        event.preventDefault();
    });
    items_div.ondragenter = function(event) {
        event.preventDefault();
        upload_div.classList.add('dragover');
    };
    upload_div.ondragleave = function(event) {
        event.preventDefault();
        upload_div.classList.remove('dragover');
    };
    upload_div.addEventListener('drop', function(event) {
        event.preventDefault();
        upload_div.classList.remove('dragover');
        // 获取拖拽进入的文件并逐个验证文件扩展名然后上传
        let files = event.dataTransfer.files;
        for (let i=0; i<files.length; i++) {
            let file = files[i];
            if (file.type !== 'image/jpeg' && file.type !== 'image/jpg') {
                alert('上传失败！只能上传.jpg格式图片');
                continue;
            }
            // 图片转base64格式后上传
            let reader = new FileReader();
            reader.onload = (event) => {
                let item_data = {
                    name: file.name.replace('.jpg', '.json').replace('.jpeg', '.json'), 
                    frame: event.target.result, 
                    elements: []
                };
                uploadItem(item_data);
            };
            reader.readAsDataURL(file);
        }
    });
    // 键盘操作动作监听
    document.addEventListener('keyup', function(event) { // 单键
        let key = event.key;
        if      (key === '1') {print(`键盘事件：绘制${type_map[type]}`, false); points = []; type = parseInt(key);}
        else if (key === '2') {print(`键盘事件：绘制${type_map[type]}`, false); points = []; type = parseInt(key);}
        else if (key === '3') {print(`键盘事件：绘制${type_map[type]}`, false); points = []; type = parseInt(key);}
        else if (key === 'q') {print(`键盘事件：上一张`, false); last();}
        else if (key === 'e') {print(`键盘事件：下一张`, false); next();}
        else {}
    });
    document.addEventListener('keydown', function(event) { // ctrl + 组合键
        if (type != -1) {
            print(`新的按键事件，绘制已重置`, false);
            type = -1;
            draw(-1, drawing_canvas_context, [], 3, '#0000ff', true);
        }

        let key = event.key;
        if      (event.ctrlKey && key === 'z') {event.preventDefault(); print(`键盘事件：撤销`, false); revoke();}
        else if (event.ctrlKey && key === 's') {event.preventDefault();}
        else {}
    });
    drawing_canvas.addEventListener('click', function() {
        points.push([mx, my]);
        drawing(true);
    });
    drawing_canvas.addEventListener('mousemove', function(event) {
        mx = Math.floor(event.clientX - frame_canvas.getBoundingClientRect().left);
        my = Math.floor(event.clientY - frame_canvas.getBoundingClientRect().top);
        drawing(false);
        // 鼠标跟随事件
        mxy_div.style.left = `${event.clientX}px`;
        mxy_div.style.top = `${event.clientY}px`;
        mxy_div.textContent = `${Math.floor(mx/resize_rate)}, ${Math.floor(my/resize_rate)}`;
    });
    // 绘制区域进入与离开事件
    drawing_canvas.addEventListener('mouseenter', function() {
        mxy_div.style.display = 'block'; // 显示坐标
    });
    drawing_canvas.addEventListener('mouseleave', function() {
        mxy_div.style.display = 'none'; // 隐藏坐标
    });
    rest_div.addEventListener('mouseleave', function() { // 超过绘制区域自动取消绘制
        if (type != -1) {
            print(`超出绘制区域，绘制已重置`, false);
            type = -1;
            draw(-1, drawing_canvas_context, [], 3, '#0000ff', true);
        }
    });
}

loadItems();
eventInit();
