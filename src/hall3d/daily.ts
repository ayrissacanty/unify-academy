/** A small "moment of the day" announced at morning arrival, so no two school days feel the same.
 *  Gentle and optional: a kindness idea, a fun fact, a challenge. The weekly events (Spirit Week, Picture Day...) live in src/game/events.ts. */
export interface Moment { id: string; icon: string; title: string; text: string }
export const MOMENTS: Moment[] = [
  { id: "kind", icon: "💛", title: "Kindness Monday", text: "Today's idea: say one kind thing to someone in the hallway." },
  { id: "fact", icon: "🌟", title: "Mystery fact", text: "Did you know? Octopuses have three hearts. Can you find out how many hearts you have?" },
  { id: "pet", icon: "🐾", title: "Class pet check-in", text: "Good morning! Has the class pet had its breakfast? Look for the pen in the classroom corner." },
  { id: "read", icon: "📖", title: "Reading minute", text: "Find a quiet spot and read one page of anything you like before class." },
  { id: "gratitude", icon: "🍀", title: "Thankful minute", text: "Think of one thing you are thankful for today. Share it with a friend if you like." },
  { id: "stretch", icon: "🧘", title: "Stretch break", text: "Reach up high, then touch your toes. A good stretch wakes up the brain." },
  { id: "riddle", icon: "🧩", title: "Riddle of the day", text: "What has hands but cannot clap? (Hint: look at the wall in your classroom.)" },
  { id: "compliment", icon: "🌈", title: "Compliment chain", text: "Give a compliment today, and pass the chain along when you get one." },
  { id: "weather", icon: "⛅", title: "Weather watch", text: "Look out of a window. What is the sky doing right now? Sunny, cloudy, rainy?" },
  { id: "word", icon: "🔤", title: "Word of the day", text: "Today's word is 'curious'. Try using it in a sentence in class." },
  { id: "tidy", icon: "🧹", title: "Tidy-up team", text: "Leave your space a little tidier than you found it. Small helps add up." },
  { id: "music", icon: "🎵", title: "Hum a tune", text: "Hum your favourite song while you walk. Can anyone guess what it is?" },
  { id: "buddy", icon: "🤝", title: "Buddy day", text: "Say hello to someone you do not know well yet. New friends are everywhere." },
  { id: "goal", icon: "🎯", title: "One goal", text: "Pick one thing you want to do well today, and tell yourself when you did it." },
];
export const dayNumber = (d = new Date()) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
/** the same moment for everyone on the same day; consecutive days never repeat */
export const momentFor = (d = new Date()): Moment => MOMENTS[dayNumber(d) % MOMENTS.length];
