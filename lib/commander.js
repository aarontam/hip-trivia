var Trivia = require('./trivia'),
	trivia = new Trivia(),
	mode = require('./modes');

exports.pattern = /^\/(trivia|t|a|ans|answer)(?:$|\s)(?:(.+))?/;

exports.onCommand = function *() {
	var slash = this.match[1],
		args = this.match[2],
		endpoint = '',
		params = '',
		command, option,
		msg, idx,
		payload, catInfo;

	switch (slash) {
		case 'a':
		case 'ans':
		case 'answer':
			yield* trivia.checkAnswer.call(this, args);
			break;

		case 't':
		case 'trivia':
			args = args ? args.trim() : null;

			if (args) {
				args = args.split(' ');
				command = args[0];
				option = args[1];

				switch (command) {
					case 'a':
					case 'answer':
						yield* trivia.checkAnswer.call(this, option);
						break;
					case 'c':
					case 'cat':
					case 'cats':
					case 'category':
					case 'categories':
						if (option) {
							catInfo = trivia.categories[option];
							if (catInfo) {
								trivia.state.category = option;
								trivia.state.categoryId = catInfo.id;
								trivia.state.cluesCount = catInfo.count;
								yield trivia.sendMessage.call(this, 'The category has been set to <b>' + option + '</b>');
							} else {
								// yield this.roomClient.sendNotification('The <em>' + option + '</em> category could not be found; try specifying another.');
								yield trivia.sendMessage.call(this, 'The <em>' + option + '</em> category could not be found; try specifying another.');
							}
						} else {
							endpoint = 'categories';
							params = 'count=10&offset=' + Math.floor(Math.random()*1000);
							msg = '<b>Categories</b><br />';

							for (idx = 0; idx < payload.length; idx++) {
								trivia.categories[payload[idx].title] = {id: payload[idx].id, count: payload[idx].clues_count};
								msg += (idx+1) + '. ' + payload[idx].title + '<br />';
							}

							yield trivia.sendMessage.call(this, msg);
						}
						break;
					case 'info':
						yield trivia.sendMessage.call(this, 'The current category is <b>' + trivia.state.category + '</b>');
						break;
					case 'uncle':
					case 'giveup':
						yield trivia.sendMessage.call(this, 'Answer: ' + trivia.state.answer);
						yield* trivia.reset.call(this);
						break;
					case 'help':
					case '?':
						yield trivia.sendMessage.call(this, 'To ask a new question: <b>/t[rivia]</b>' + '<br />'
															+  'To answer a question: <b>/a[nswer] &lt;your answer&gt;</b>' + '<br />'
															+  'To list 10 (random) categories: <b>/trivia categories</b>' + '<br />'
															+  'To set the current category (using a previously listed category): <b>/trivia category [category title]</b>' + '<br />'
															+  'To reveal the current answer (don\'t spoil it for others!): <b>/trivia uncle</b>' + '<br />'
															+  'To see the leaderboard: <b>/trivia standings</b>' + '<br />'
															+  'To stop playing trivia: <b>/trivia stop</b>' + '<br />'
															+  'A new trivia question will appear shortly after the previous question is answered correctly, or when the room gives up.');
						break;
					case 'standings':
					case 'score':
					case 'scores':
					case 'scoreboard':
					case 'winnings':
					case 'leaders':
					case 'leaderboard':
					case 'results':
						yield trivia.showWinnings.call(this);
						break;
					case 'stop':
					case 'quit':
					case 'q':
					case 'end':
					case 'pause':
						trivia.state.mode = mode.STOPPED;
						yield trivia.sendMessage.call(this, 'No more trivia!');
						yield trivia.showWinnings.call(this);
						yield* trivia.reset.call(this);

						break;
				}
			} else {
				if (typeof trivia.state.mode === 'undefined' || trivia.state.mode == mode.STOPPED) {
					yield trivia.sendMessage.call(this, 'Trivia... HAS BEGUN!');
					trivia.state.mode = mode.STARTED;
					yield* trivia.generateClue.call(this);
				}
			}

			break;
	}
};