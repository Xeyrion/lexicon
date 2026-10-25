import type { Story } from '../types'

/**
 * Built-in story: a rainy night, a lighthouse that has been dark for three
 * winters, and a keeper who never quite left. Quiet, not scary.
 *
 * Vars
 *   courage          boldness. Gates the hidden choice and nothing else.
 *   trust            how much he tells you. Changes one node's text.
 *   helped_stranger  you took the buckets. Changes one node's text.
 *   knows_name       you read the logbook. Gates the hidden choice.
 */
export const LIGHTHOUSE_STORY: Story = {
  id: 'the-lighthouse',
  title: 'The Lighthouse',
  author: 'Lexicon',
  level: 'B1',
  description: '雨夜灯塔，一个不肯离开的守塔人。',
  start: 'arrive',
  initialVars: {
    courage: 0,
    trust: 0,
    helped_stranger: false,
    knows_name: false,
  },
  endings: [
    {
      id: 'leave',
      name: 'The Six O\'Clock Bus',
    },
    {
      id: 'stay',
      name: 'Keeper',
    },
    {
      id: 'truth',
      name: 'The Remarks Column',
      hidden: true,
      hint: 'Read what the keeper wrote. Then be brave enough to say it out loud.',
    },
  ],
  nodes: [
    {
      id: 'arrive',
      text: "The rain had been falling since noon. By the time I reached the causeway, the sea was already over the stones, and I ran the last hundred metres with my bag against my chest.\n\nThe lighthouse stood at the end of the road, white, streaked with rust. Every window was dark except one, high up, near the top. Somebody was home.\n\nI stood there a moment, breathing. Then I walked to the door.",
      choices: [
        {
          id: 'knock',
          label: 'Knock on the door',
          to: 'door',
          effects: [{ var: 'courage', add: 1 }],
        },
        {
          id: 'go-around',
          label: 'Walk around to the back',
          to: 'back',
        },
      ],
    },
    {
      id: 'back',
      text: "The back of the lighthouse was worse than the front. The wind came straight off the water and the ground was all loose stone.\n\nA man was standing at the edge of the rocks with a bucket in each hand. He wore no coat. Rain ran off his face and he did not wipe it away.\n\nHe had not heard me. Or he had, and did not care.",
      choices: [
        {
          id: 'call-out',
          label: 'Call out to him',
          to: 'call',
          effects: [{ var: 'courage', add: 1 }],
        },
        {
          id: 'back-to-door',
          label: 'Go back to the door',
          to: 'door',
        },
        {
          id: 'back-to-road',
          label: 'Walk back to the road',
          to: 'road',
        },
      ],
    },
    {
      id: 'road',
      text: "I looked back the way I had come. The causeway was still there, just, but the water was moving across it in long grey sheets. In an hour it would be gone. In two hours it would come back.\n\nThere was a bus at six. I knew that much. I had checked the timetable at the station and folded it into my pocket, and now I could feel the corner of it against my leg.",
      choices: [
        {
          id: 'cross-now',
          label: 'Cross before the water rises',
          to: 'leave_end',
        },
        {
          id: 'road-to-door',
          label: 'Go back to the lighthouse',
          to: 'door',
        },
      ],
    },
    {
      id: 'door',
      text: "The door opened before I knocked.\n\nHe was older than I expected, and smaller. Grey hair flat against his head from the rain. He looked at my bag, then at my face, and stood aside without a word.\n\n'You're late,' he said. Then, after a moment: 'Everyone is late now. Come in or don't.'\n\nThe wind pushed at the door between us.",
      choices: [
        {
          id: 'step-inside',
          label: 'Step inside',
          to: 'hall',
          effects: [{ var: 'courage', add: 1 }],
        },
        {
          id: 'ask-light',
          label: 'Ask why the light is dark',
          to: 'ask',
          effects: [{ var: 'trust', add: 1 }],
        },
      ],
    },
    {
      id: 'ask',
      text: "'The light,' I said. 'It isn't on.'\n\nHe looked up at the tower as if he had not noticed. 'No,' he said. 'Not for three winters. The village stopped paying for the oil, and then they stopped coming out here at all. There's nobody on the water at night now. Only the ones who don't have a choice.'\n\nHe said it without complaint. It was a fact he had got used to.",
      choices: [
        {
          id: 'ask-inside',
          label: 'Step inside',
          to: 'hall',
          effects: [
            { var: 'courage', add: 1 },
            { var: 'trust', add: 1 },
          ],
        },
        {
          id: 'ask-who',
          label: 'Ask who he is',
          to: 'name',
          effects: [{ var: 'trust', add: 1 }],
        },
      ],
    },
    {
      id: 'name',
      text: "'Who are you?' I asked.\n\n'Vale.' He moved the bucket to his other hand. 'I kept the light. Twenty-two years. Then they sent a letter saying the station was closed, and I went and lived in the village like a man with a job.'\n\nHe said the word kept as if he still owned it. Then he turned and walked towards the door, and I understood that I was expected to follow.",
      choices: [
        {
          id: 'name-inside',
          label: 'Go inside with him',
          to: 'hall',
          effects: [{ var: 'courage', add: 1 }],
        },
        {
          id: 'name-leave',
          label: 'Turn back to the road',
          to: 'leave_end',
        },
      ],
    },
    {
      id: 'call',
      text: "'Hello,' I called.\n\nHe turned. His face was wet and calm. He looked at me for a long moment, then past me at the tower, and something in his shoulders changed. Not surprise. More like a man who has been waiting for a delivery and has stopped expecting it.\n\n'You picked a bad night,' he said. 'Help me with these.'",
      choices: [
        {
          id: 'take-bucket',
          label: 'Take a bucket from him',
          to: 'hall',
          effects: [
            { var: 'helped_stranger', set: true },
            { var: 'courage', add: 1 },
            { var: 'trust', add: 1 },
          ],
        },
        {
          id: 'follow-him',
          label: 'Follow him inside',
          to: 'hall',
          effects: [{ var: 'trust', add: 1 }],
        },
      ],
    },
    {
      id: 'hall',
      text: "Inside, the lighthouse was smaller than it looked from the road. A stove, two chairs, a table with a lamp on it. The walls were white and bare except for a barometer and a photograph of a ship I did not recognise.\n\nHe set the buckets down and lit the stove. The fire made the room feel like a room again.\n\n'There's tea,' he said, 'if you want it.' He did not ask my name. He did not ask why I had come.",
      variants: [
        {
          when: [{ var: 'helped_stranger', is: true }],
          text: "Inside, the lighthouse was smaller than it looked from the road. A stove, two chairs, a table with a lamp on it. The walls were bare except for a barometer and a photograph of a ship I did not know.\n\nHe took the bucket from me, set both down, and nodded at me once, as if we had agreed on something. Then he lit the stove.\n\n'There's tea,' he said, 'if you want it.' He did not ask my name. He did not ask why I had come.",
        },
      ],
      choices: [
        {
          id: 'open-book',
          label: 'Open the logbook on the table',
          to: 'book',
          effects: [{ var: 'knows_name', set: true }],
        },
        {
          id: 'hall-stairs',
          label: 'Climb the stairs',
          to: 'stairs',
          effects: [{ var: 'courage', add: 1 }],
        },
        {
          id: 'hall-stove',
          label: 'Sit by the stove',
          to: 'stove',
        },
      ],
    },
    {
      id: 'book',
      text: "The logbook was open at the last page. The entries were all in the same narrow hand, one for each night, going back years. Wind, visibility, ships passing. Then, three winters ago, the writing stopped in the middle of a line.\n\nI turned back a page. There was a name at the top of every entry, in the space marked keeper. The same name, over and over, until it looked less like a word and more like a mark.\n\nE. Vale.",
      choices: [
        {
          id: 'book-stairs',
          label: 'Climb the stairs',
          to: 'stairs',
          effects: [{ var: 'courage', add: 1 }],
        },
        {
          id: 'book-entry',
          label: 'Ask about the last entry',
          to: 'entry',
          effects: [{ var: 'trust', add: 1 }],
        },
      ],
    },
    {
      id: 'entry',
      text: "He came and stood behind me and read it upside down.\n\n'That was the night of the Mara,' he said. 'Coal boat out of the north. She came in close because the light was late, and she went onto the rocks by the point. Six men. They got four of them off.'\n\nHe was quiet for a while.\n\n'The light was late because I was asleep,' he said. 'So. There it is.'",
      choices: [
        {
          id: 'entry-stairs',
          label: 'Climb the stairs',
          to: 'stairs',
          effects: [{ var: 'courage', add: 1 }],
        },
        {
          id: 'entry-leave',
          label: 'Go back out to the road',
          to: 'leave_end',
        },
      ],
    },
    {
      id: 'stairs',
      text: "The stair went up inside the tower, turning tighter as it climbed. Eighty-eight steps, he told me once, though I never counted.\n\nThe wall was cold on one side and warm on the other. The higher I went, the louder the wind got, until it was not a sound anymore but a pressure in my ears.\n\nBehind me, his footsteps stopped.\n\nI kept going.",
      choices: [
        {
          id: 'open-lamp-room',
          label: 'Open the lamp-room door',
          to: 'lamp',
        },
        {
          id: 'stairs-down',
          label: 'Go back down',
          to: 'hall',
        },
      ],
    },
    {
      id: 'lamp',
      text: "The lamp room was glass on every side, and the whole sea was out there, black and moving. The great lens stood in the middle, cold and dusty, a machine built for something that no longer happened.\n\nVale came up behind me, breathing hard.\n\n'You can clean it,' he said. 'You can fill it. It won't make any difference to anyone. There's nobody out there.'\n\nHe said it the way a man says a thing he wants to be argued with about.",
      choices: [
        {
          id: 'light-it',
          label: 'Clean the lens and light it',
          to: 'light',
        },
        {
          id: 'say-name',
          label: 'Say his name out loud',
          to: 'truth',
          requires: [
            { var: 'knows_name', is: true },
            { var: 'courage', gte: 3 },
          ],
        },
        {
          id: 'lamp-down',
          label: 'Go back down',
          to: 'hall',
        },
      ],
    },
    {
      id: 'light',
      text: "I found a cloth and wiped the lens, and the dust came off in long grey lines. He brought the oil without being asked. It took a while. Neither of us said anything.\n\nWhen it caught, the light did not look like much. A small yellow thing turning in a glass room.\n\nThen it went out across the water, one long arm of it and then another, and the whole sea was suddenly there, and then gone, and then there again.",
      choices: [
        {
          id: 'wait-dawn',
          label: 'Wait for the morning',
          to: 'dawn',
        },
        {
          id: 'light-down',
          label: 'Go back down to the stove',
          to: 'hall',
        },
      ],
    },
    {
      id: 'dawn',
      text: "We sat on the floor of the lamp room and watched it turn. After a time the rain stopped. The sky went grey, then lighter, and the sea turned the colour of old metal.\n\n'You could stay,' he said. 'There's a bed. There's work, if you can call it that.'\n\nHe was not looking at me when he said it.",
      variants: [
        {
          when: [{ var: 'trust', gte: 2 }],
          text: "We sat on the floor of the lamp room and watched it turn. He told me about the village, and the boat he had lost, and the winter his wife left and the winter she wrote. After a time the rain stopped. The sky went grey, then lighter, and the sea turned the colour of old metal.\n\n'You could stay,' he said. 'There's a bed. There's work, if you can call it that.'\n\nHe was not looking at me when he said it.",
        },
      ],
      choices: [
        {
          id: 'choose-stay',
          label: 'Stay',
          to: 'stay_end',
        },
        {
          id: 'choose-bus',
          label: 'Take the morning bus',
          to: 'leave_end',
        },
      ],
    },
    {
      id: 'stove',
      text: "I sat by the stove and he made the tea, and for a while neither of us said anything. The fire ticked. Outside, the sea went on doing what it did.\n\n'People think a light is for the ships,' he said. 'It isn't. It's for the ones on the shore. So they know somebody is still out there, keeping watch.'\n\nHe put the cup down in front of me and did not sit down himself.",
      choices: [
        {
          id: 'stove-stairs',
          label: 'Climb the stairs',
          to: 'stairs',
          effects: [{ var: 'courage', add: 1 }],
        },
        {
          id: 'stove-leave',
          label: 'Drink it and go',
          to: 'leave_end',
        },
      ],
    },
    {
      id: 'truth',
      text: "'Vale,' I said. 'E. Vale. It's on every page of that book.'\n\nHe stopped moving. For a moment he looked like a man who had been caught at something, and then like a man who was tired of not being caught.\n\n'I was going to write it down,' he said. 'The night it happened. All of it. But I couldn't find a way to put it in the columns, so I stopped writing.'\n\n'Write it now,' I said. He held out the pen.",
      choices: [
        {
          id: 'write-entry',
          label: 'Write the entry yourself',
          to: 'truth_end',
        },
        {
          id: 'refuse-pen',
          label: 'Leave the book closed',
          to: 'leave_end',
        },
      ],
    },
    {
      id: 'leave_end',
      text: "I took the bus at six. It was almost empty. The driver knew me by then, or knew my bag.\n\nFrom the road you can see the tower for about a mile, and then a bend takes it, and that is that. I looked back once. There was a light at the top, or there wasn't. From that far off I could not tell.\n\nI still have the timetable. I don't know why I kept it.",
      ending: 'leave',
    },
    {
      id: 'stay_end',
      text: "I stayed. There is no dramatic way to say it. One morning I carried my bag up the stairs instead of down, and after that the days had a shape to them.\n\nThe village still doesn't pay for the oil. Vale doesn't ask them to. We fill it anyway, most nights, and the light goes out over the water and comes back, and nobody sees it but us.\n\nSome nights a boat answers. That's enough.",
      ending: 'stay',
    },
    {
      id: 'truth_end',
      text: "I wrote it in the columns, because there was nowhere else to put it. The date, the wind, the visibility. Then, in the space for remarks: The light was late. Six men in the water. Four came home. The keeper was asleep.\n\nVale read it twice. Then he signed it, and closed the book, and went down the stairs, and I did not see him again.\n\nThe light is still on. That is the whole of it.",
      ending: 'truth',
    },
  ],
}

/** 从 start 出发、攒够变量走到隐藏结局的一条参考路径，供测试与文档使用。 */
export const LIGHTHOUSE_HIDDEN_PATH: string[] = [
  'arrive',
  'door',
  'hall',
  'book',
  'stairs',
  'lamp',
  'truth',
  'truth_end',
]
