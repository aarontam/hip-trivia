
var incorrectWeight = 0.05;

function Tenant () {
	this.state = {};
	this.players = {};
}

Tenant.prototype.getState = function (key) {
	return this.state[key];
};

Tenant.prototype.setState = function (key, value) {
	this.state[key] = value;
};

Tenant.prototype.addPlayer = function (sender) {
	var player = this.players[sender.id];

	player = {
		name: sender.name,
		winnings: 0,
		correct: 0,
		attempts: 0
	};

	return player;
};

Tenant.prototype.getPlayer = function (id) {
	return this.players[id];
};

Tenant.prototype.getPlayers = function () {
	return this.players;
};

Tenant.prototype.recordGuess = function (sender, amount, correct) {
	var player = this.players[sender.id];

	if (!player) this.players[sender.id] = player = this.addPlayer(sender);

	player.winnings += (correct ? 1 : -1 * incorrectWeight) * amount;
	player.attempts += 1;
	if (correct) player.correct += 1;

	return player;
};

module.exports = Tenant;