
var incorrectWeight = 0.05;

/**
 * Encapsulates the state for a single tenant (room). This includes meta-level state information of
 * any current trivia games, as well as player information.
 */
function Tenant () {
	this.state = {
		hintLevel: 0
	};
	this.players = {};
}

/**
 * Returns the value of the specified state key.
 *
 * @param   {String} key - The state key we wish to retrieve.
 * @returns {*} The value associated with the key.
 */
Tenant.prototype.getState = function (key) {
	return this.state[key];
};

/**
 * Sets the value for the specified state key.
 *
 * @param {String} key - The state key whose value we wish to set.
 * @param {*} value - The value of the state key.
 */
Tenant.prototype.setState = function (key, value) {
	this.state[key] = value;
};

/**
 * Adds a player.
 *
 * @param {Object} sender - The HipChat user object for the player we wish to add.
 */
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

/**
 * Retrieves a specific player.
 *
 * @param   {String} id - The unique identifier of the player we wish to retrieve.
 * @returns {Object} The player object, that contains a player's name and stats.
 */
Tenant.prototype.getPlayer = function (id) {
	return this.players[id];
};

/**
 * Retrieves all of the players that are participating in the current trivia game.
 *
 * @returns {Object[]} A set of player objects.
 */
Tenant.prototype.getPlayers = function () {
	return this.players;
};

/**
 * Records a guess for a specific player, updating any necessary stats.
 *
 * @param   {Object} sender - The HipChat user object for the player.
 * @param   {Number} amount - The value of the clue.
 * @param   {Boolean} correct - If `true`, the guess was correct; `false` otherwise.
 * @returns {Object} The player object, that contains a player's name and stats.
 */
Tenant.prototype.recordGuess = function (sender, amount, correct) {
	var player = this.players[sender.id];

	if (!player) this.players[sender.id] = player = this.addPlayer(sender);

	player.winnings += (correct ? 1 - this.getState('hintLevel') * incorrectWeight * 2 : -1 * incorrectWeight) * amount;
	player.attempts += 1;
	if (correct) player.correct += 1;

	return player;
};

module.exports = Tenant;