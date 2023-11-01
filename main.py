import flask
import os
import time
import json
import base64

storage = "storage" # 图像存储目录

app = flask.Flask(__name__)

@app.route("/", methods=["GET"]) # GET 根目录
def index():
    return flask.render_template("index.html")

@app.route("/items", methods=["GET"]) # GET 获取项目列表
def items():
    items_list = os.listdir(storage)
    return flask.jsonify(items_list)

@app.route("/item", methods=["GET"]) # GET 获取某个项目的完整信息
def item():
    name = flask.request.args.get("name") # 项目名称 xxx.json
    item_data = json.load(open(f"{storage}/{name}", "r"))
    """
    storage/xxx.json: 
    {
        "name": "xxx.json", 
        "frame": "b64", 
        "elements": [{"type": 1/2/3, "points": [[x0, y0], ...]}, ...]
    }
    """
    return flask.jsonify(item_data)

@app.route('/upload', methods=['POST']) # POST 上传一个项目
def upload():
    item_data = flask.request.get_json()
    json.dump(item_data, open(f"{storage}/{item_data['name']}", "w"))
    return flask.jsonify({})

@app.route("/delete", methods=["GET"]) # GET 删除一个项目
def delete():
    name = flask.request.args.get("name")
    if os.path.exists(f"{storage}/{name}"):
        os.remove(f"{storage}/{name}")
    return flask.jsonify({})

@app.route('/update', methods=['POST']) # POST 更新（覆盖）一个项目元素
def update():
    item_data_new = flask.request.get_json()
    item_data_raw = json.load(open(f"{storage}/{item_data_new['name']}", "r"))
    item_data_raw["elements"] = item_data_new["elements"].copy()
    json.dump(item_data_raw, open(f"{storage}/{item_data_new['name']}", "w"))
    return flask.jsonify({})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=60000, debug=True)