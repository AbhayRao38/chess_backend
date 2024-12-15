"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var ws_1 = require("ws");
var GameManager_1 = require("./GameManager");
var wss = new ws_1.WebSocketServer({ port: 8080 });
var gameManager = new GameManager_1.GameManager();
wss.on('connection', function connection(ws) {
    gameManager.addUser(ws);
    ws.on("disconnect", function () { return gameManager.removeUser(ws); });
});
