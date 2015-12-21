var ack = require('ac-koa').require('hipchat');
var pkg = require('./package.json');
var app = ack(pkg);
var commander = require('./lib/commander');

var addon = app.addon()
	.hipchat()
	.allowRoom(true)
	.scopes('send_notification', 'admin_room');

if (process.env.DEV_KEY) {
	addon.key(process.env.DEV_KEY);
}

/**
 * Entry point.
 */
addon.webhook('room_message', commander.pattern, commander.onCommand);

app.listen();
