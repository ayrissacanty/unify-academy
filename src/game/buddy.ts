/** Study buddy "Sparky": a friendly helper in class that gives hints, never answers. Three levels: a nudge, a strategy, then a way to ask for help.
 *  After that it asks a "teach it back" question. All wording is rule-based (no AI needed) and kind; it always points back to the lesson and the teacher. */
export const BUDDY_NAME = "Sparky";
export type BuddySubject = "math" | "ela" | "science" | "history" | "careers" | "life";
const NUDGE: Record<BuddySubject, string> = {
  math: "Look at what the problem is really asking. Circle the numbers, then say in your own words what you need to find.",
  ela: "Go back to the text and find the line that fits. Which words in the question match words in the passage?",
  science: "Think about what you can observe. What changed, and what stayed the same?",
  history: "Ask who, what, when and why. Which of those is the question asking about?",
  careers: "Picture someone doing this job today. What would they need to know first?",
  life: "Think about how you would feel, and how the other person might feel. What would a good friend do?",
};
const STRATEGY: Record<BuddySubject, string> = {
  math: "Try a smaller version of the problem, or draw it. Pictures and easy numbers can show the pattern.",
  ela: "Read the sentence before and after it. Then cross out choices that cannot be right and pick from what is left.",
  science: "Make a quick prediction, then check it against the lesson. Sketching a diagram can help.",
  history: "Put the events in order on a mini timeline. Seeing what came first often shows the reason.",
  careers: "List three skills that job uses. Which of them have you already practised?",
  life: "Write two choices and one result for each. Which result are you proudest of?",
};
const ASK = "You are close! Press Raise hand and ask your teacher, or look at the lesson step again. Asking is part of learning.";
const TEACH = [
  (t: string) => `Teach it back: explain "${t}" in one sentence, as if to a younger friend.`,
  (t: string) => `Can you think of a real-life example of "${t}"?`,
  (t: string) => `What was the trickiest part of "${t}", and what helped you with it?`,
  (t: string) => `If you had to make a question about "${t}", what would you ask?`,
];
/** the nth press of the buddy button for one lesson: nudge, strategy, ask-for-help, then teach-back prompts (cycling) */
export function buddySay(subject: string, lessonTitle: string, press: number): string {
  const s = (subject in NUDGE ? subject : "life") as BuddySubject, t = lessonTitle.replace(/[<>]/g, "").slice(0, 60) || "this lesson", n = Math.max(0, press);
  if (n === 0) return NUDGE[s]; if (n === 1) return STRATEGY[s]; if (n === 2) return ASK; return TEACH[(n - 3) % TEACH.length](t);
}
