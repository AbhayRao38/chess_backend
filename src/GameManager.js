"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameManager = void 0;
var messages_1 = require("./messages");
var Game_1 = require("./Game");
// User, Game
var GameManager = /** @class */ (function () {
    function GameManager() {
        this.games = [];
        this.pendingUser = null;
        this.users = [];
    }
    GameManager.prototype.addUser = function (socket) {
        this.users.push(socket);
        this.addHandler(socket);
    };
    GameManager.prototype.removeUser = function (socket) {
        this.users = this.users.filter(function (user) { return user !== socket; });
        // Stop the game here because the user left
    };
    GameManager.prototype.addHandler = function (socket) {
        var _this = this;
        socket.on("message", function (data) {
            var message = JSON.parse(data.toString());
            if (message.type === messages_1.INIT_GAME) {
                if (_this.pendingUser) {
                    var game = new Game_1.Game(_this.pendingUser, socket);
                    _this.games.push(game);
                    _this.pendingUser = null;
                }
                else {
                    _this.pendingUser = socket;
                }
            }
            if (message.type === messages_1.MOVE) {
                console.log("inside move");
                var game = _this.games.find(function (game) { return game.player1 === socket || game.player2 === socket; });
                if (game) {
                    console.log("inside makemove");
                    game.makeMove(socket, message.payload.move);
                }
            }
        });
    };
    return GameManager;
}());
exports.GameManager = GameManager;
