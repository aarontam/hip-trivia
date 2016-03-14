var Trivia = require('./trivia'),
	trivia = new Trivia(),
	package = require('./package.json'),
	modes = require('./modes'),
	tenants = require('./tenants');

trivia.tenants = tenants;

// The roomhook pattern
exports.pattern = /^\/(trivia|t|a|ans|answer)(?:$|\s)(?:(.+))?/;

/**
 * The roomhook handler.
 */
exports.onCommand = function *() {
	var slash = this.match[1],
		args = this.match[2],
		endpoint = '',
		params = '',
		command, option,
		msg, idx,
		payload, catInfo,
		mode, tenant;

	// TODO: Guard against unnecessarily making this fn call
	tenants.addTenant(this.tenant.id);

	trivia.roomClient = this.roomClient;
	trivia.sender = this.sender;
	trivia.tenant = this.tenant;

	tenant = tenants.getTenant(this.tenant.id);
	mode = tenant.getState('mode');

	switch (slash) {
		case 'a':
		case 'ans':
		case 'answer':
			if (mode == modes.ACTIVE) {
				yield* trivia.checkAnswer(args);
			}
			break;

		case 't':
		case 'trivia':
			args = args ? args.trim() : null;

			if (args) { // Specific trivia command
				args = args.split(' ');
				command = args[0];
				option = args[1];

				switch (command) {
					case 'a':
					case 'answer':
						if (mode == modes.ACTIVE) {
							yield* trivia.checkAnswer(option);
						}
						break;

					case 'c':
					case 'cat':
					case 'cats':
					case 'category':
					case 'categories':
						if (option) {
							catInfo = trivia.categories[option];
							if (catInfo) {
								tenant.setState('category', option);
								tenant.setState('categoryId', catInfo.id);
								tenant.setState('cluesCount', catInfo.count);
								yield trivia.sendMessage(`The category has been set to <b>${option}</b>`);
							} else {
								yield trivia.sendMessage(`The <em>${option}</em> category could not be found; try specifying another.`);
							}
						} else {
							endpoint = 'categories';
							params = 'count=10&offset=' + Math.floor(Math.random()*1000);
							msg = '<b>Categories</b><br />';

							for (idx = 0; idx < payload.length; idx++) {
								trivia.categories[payload[idx].title] = {id: payload[idx].id, count: payload[idx].clues_count};
								msg += `${idx+1}. ${payload[idx].title}<br />`;
							}

							yield trivia.sendMessage(msg);
						}
						break;

					case 'info':
						yield trivia.sendMessage(`The current category is <b>${tenant.getState('category')}</b>`);
						break;

					case 'uncle':
					case 'giveup':
						if (mode == modes.ACTIVE) {
							yield trivia.sendMessage(`Answer: ${tenant.getState('answer')}`);
							yield* trivia.reset();
						}
						break;

					case 'help':
					case '?':
						yield trivia.sendMessage('Trebek / Hip Trivia version ' + package.version + '<br />'
												+'To ask for a hint: <b>/t hint</b>' + '<br />'
												+'To ask a new question: <b>/t[rivia]</b>' + '<br />'
												+'To answer a question: <b>/a[nswer] &lt;your answer&gt;</b>' + '<br />'
												+'To list 10 (random) categories: <b>/t[rivia] categories</b>' + '<br />'
												+'To set the current category (using a previously listed category): <b>/t[rivia] category &lt;category title&gt;</b>' + '<br />'
												+'To reveal the current answer (don\'t spoil it for others!): <b>/t[rivia] uncle</b>' + '<br />'
												+'To see the leaderboard: <b>/t[rivia] standings</b>' + '<br />'
												+'To stop playing trivia: <b>/t[rivia] stop</b>' + '<br />'
												+'A new trivia question will appear shortly after the previous question is answered correctly, or when the room gives up.');
						break;

					case 'standings':
					case 'score':
					case 'scores':
					case 'scoreboard':
					case 'winnings':
					case 'leaders':
					case 'leaderboard':
					case 'results':
						yield trivia.showWinnings();
						break;

					case 'stop':
					case 'quit':
					case 'q':
					case 'end':
					case 'pause':
						tenant.setState('mode', modes.STOPPED);
						yield trivia.sendMessage('No more trivia!');
						yield trivia.showWinnings();
						yield* trivia.reset();
						break;

					case 'hint':
					case 'hints':
					case 'wat':
					case '(wat)':
						if (mode == modes.ACTIVE) yield trivia.showHint();
						break;
				}
			} else { // Request to start trivia
				if (typeof mode === 'undefined' || mode == modes.STOPPED) {
					yield trivia.sendMessage('Trivia... HAS BEGUN!');
					tenant.setState('mode', modes.STARTED);
					yield* trivia.generateClue();
				}
			}

			break;
	}
};