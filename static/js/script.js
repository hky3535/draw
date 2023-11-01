const items_ul = document.getElementById('items_ul');
const upload_div = document.getElementById('upload_div');

const name_input = document.getElementById('name_input');
const element_textarea = document.getElementById('element_textarea');
const elements_ul = document.getElementById('elements_ul');
const console_textarea = document.getElementById('console_textarea');

const draw_div = document.getElementById('draw_div');
const frame_canvas = document.getElementById('frame_canvas');
const frame_canvas_context = frame_canvas.getContext('2d'); // 图像
const drawn_div = document.getElementById('drawn_div'); // 绘制完成
const drawing_canvas = document.getElementById('drawing_canvas');
const drawing_canvas_context = drawing_canvas.getContext('2d'); // 绘制中

const mxy_div = document.getElementById('mxy_div'); // 鼠标跟随

let name_list = [];
let item_data = {}; // 当前项目信息 name frame elements (element: {'type': 1/2/3, 'points': [[x0, y0], ...]})

let resize_rate = 1; // 当前图像计算出的缩放率

let type = -1; // 当前的绘制类别
let type_map = {1: '多边形', 2: '矩形', 3: '线段'};
let points = []; // 当前的绘制点集合
let mx = 0; let my = 0; // 正在移动的鼠标位置

function console(info) {
    console_textarea.value += info + "\n";
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
            console(`获取到items列表：${JSON.stringify(items_list)}`);
        })
        .catch(error => {
            console('Error: ' + error);
        });
}
function loadItem(name) { // 加载项目 loadItem --> loadFrame --> loadElements
    fetch(`/item?name=${name}`)
        .then(response => response.json())
        .then(data => {
            item_data = data;
            name_input.value = name; // 显示名称
            loadFrame(); // 显示图像
            console('获取到item：' + name);
        })
        .catch(error => {
            console('Error:' + error);
        });
}
function loadFrame() {
    let frame_b64 = item_data['frame']; // data:image;base64,...

    let frame_img = new Image();
    frame_img.src = frame_b64;
    frame_img.onload = function() {
        let input_width = frame_img.width;
        let input_height = frame_img.height; // 原图长宽
        let output_wh = draw_div.clientWidth; // 目标长宽（直接从div获取）

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
        console(`图像加载成功：输入长宽：${input_width}*${input_height}；输出长宽：${output_wh}；缩放比例：${resize_rate}`);
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
    function showDetail(points) {
        // 显示具体坐标到 textarea
        points = points.map(([x, y]) => [Math.floor(x / resize_rate), Math.floor(y / resize_rate)]); // 反归一化
        element_textarea.value = JSON.stringify(points); // 显示
    }
    function showElement(index, element, action) {
        // 将元素突出显示
        let context = drawn_div.querySelectorAll("canvas")[index].getContext('2d');
        if (action) { // 突出
            draw(element['type'], context, element['points'], 3, '#ffffff', true);
        } else { // 取消突出
            draw(element['type'], context, element['points'], 3, '#0000ff', true);
        }  
    }

    // 加载按钮
    let element_li = document.createElement('li');
    element_li.textContent = type_map[element['type']];
    element_li.addEventListener('mouseenter', () => {showElement(index, element, true);});
    element_li.addEventListener('mouseleave', () => {showElement(index, element, false);}); // 移入移出图像高亮显示
    element_li.addEventListener('click', () => {showDetail(element['points']);}); // 点击显示点位详细信息
    let element_button = document.createElement('button');
    element_button.textContent = 'delete';
    element_button.addEventListener('click', () => {event.stopPropagation(); delElement(index)});
    element_li.appendChild(element_button);
    elements_ul.appendChild(element_li);
    // 加载图层
    drawn(element['type'], element['points'], 3, '#0000ff');
}

function addElement(type, points) {
    // 增元素
    item_data['elements'] = item_data['elements'].concat([{type: type, points: points}]);
    // 前后端同步
    loadElements();
    updateItem();
}
function delElement(index) {
    // 删元素
    item_data['elements'].splice(index, 1);
    // 前后端同步
    loadElements();
    updateItem();
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
        addElement(type, points);
        // 重置绘制
        console(`绘制已完成： ${type_map[type]}, ${JSON.stringify(points)}`);
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
            console('上传成功');
            loadItems(); 
        })
        .catch(error => {
            console.error(`请求错误: ${error}`);
        });
}
function deleteItem(name) { // 删除项目
    fetch(`/delete?name=${name}`)
        .then(response => response.json())
        .then(data => {
            console(`删除项目：&{name}`);
            loadItems(); 
        })
        .catch(error => {
            console(`Error: ${error}`);
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
            console('项目更新成功');
        })
        .catch(error => {
            console(`请求错误: ${error}`);
        });
}

function undo() {
    delElement(drawn_div.querySelectorAll('canvas').length - 1);
}
function next() {
    let index = name_list.findIndex(value => value == name_input.value); // 当前所在index
    index = index + 1; // 下一张
    if (index >= name_list.length) {index = 0;} // 确保循环不越界
    loadItem(name_list[index]);
}
function last() {
    let index = name_list.findIndex(value => value == name_input.value);
    index = index - 1; // 上一张
    if (index < 0) {index = name_list.length - 1;} // 确保循环不越界
    loadItem(name_list[index]);
}

function eventInit() { // 各种监听事件初始化
    // 拖拽上传事件监听
    upload_div.addEventListener('dragover', function(event) {
        event.preventDefault();
    });
    upload_div.ondragenter = function(event) {
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
         // 获取拖拽进入的文件并验证文件扩展名
        let file = event.dataTransfer.files[0];
        if (file.type !== 'image/jpeg' && file.type !== 'image/jpg') {
            alert('只能上传 .jpg 图片');
            return;
        }
        // 图片转base64格式后上传
        let reader = new FileReader();
        reader.onload = (event) => {
            let item_data = {
                name: file.name.replace('.jpg', '.json'), 
                frame: event.target.result, 
                elements: []
            };
            uploadItem(item_data);
        };
        reader.readAsDataURL(file);
    });
    // 键盘操作动作监听
    document.addEventListener('keyup', function(event) {
        if (points.length != 0) {
            console(`新的键盘事件，绘制已重置：${JSON.stringify(points)}`);
            points = [];
            draw(-1, drawing_canvas_context, [], 3, '#0000ff', flush=true);
        }

        let key = event.key;
        if      (key === '1') {type = parseInt(key); console(`键盘事件：绘制${type_map[type]}`);}
        else if (key === '2') {type = parseInt(key); console(`键盘事件：绘制${type_map[type]}`);}
        else if (key === '3') {type = parseInt(key); console(`键盘事件：绘制${type_map[type]}`);}
        else if (key === 'q') {last(); console(`键盘事件：上一张`);}
        else if (key === 'w') {undo(); console(`键盘事件：撤销绘制`);}
        else if (key === 'e') {next(); console(`键盘事件：下一张`);}
        else {console(`键盘事件：事件未绑定：${key}`);}
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
    drawing_canvas.addEventListener('mouseleave', function() { // 超过绘制区域自动取消绘制
        mxy_div.style.display = 'none'; // 隐藏坐标
        if (points.length != 0) {
            console(`超出绘制区域，绘制已重置：${JSON.stringify(points)}`);
            points = [];
            draw(-1, drawing_canvas_context, [], 3, '#0000ff', flush=true);
        }
    });
}

loadItems();
eventInit();
