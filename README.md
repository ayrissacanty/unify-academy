# UNIFY Academy

One web app in one **paper-cut isometric** art style: a hallway, four lecture auditoriums and a live newsroom.
Run it: `npm install && npm start` → http://localhost:8787

| Piece | Files | What it is |
|---|---|---|
| **Shell** | `index.html` | Tabs and hand-offs between the pieces below |
| **Hallway** | `hallway3d.html`, `src/hall3d/*` | Perspective 3D paper-cut **indoor campus** (Three.js): a ring corridor with locker runs around four subject blocks (Math, ELA, Science, History) and a central plaza with fountain, trees and tables, ringed by lawn, trees and houses outside the walls. Orbit camera (drag, Q/E, on-screen buttons, wheel zoom) plus overview and first-person views; a **Go to** menu auto-walks you to a class door (or the **Newsroom** door in the north wall) and opens it; 20 students in K-2 / 3-5 / 6-8 / high-school size bands plus two adult staff (hall monitor and teacher) on a clock/schedule with A* pathing; a walkable player (WASD / arrows / touch pad, camera-relative). The earlier isometric version is still in `hallway.html` + `src/game/scenes/HallwayScene.ts` |
| **Auditorium** | `auditorium.html`, `src/game/scenes/AuditoriumScene.ts` | Phaser isometric lecture hall: 50 seated NPCs, raised stage, projector, first-person seat view |
| **Newsroom** | `news.html`, `src/news/*` | Live studio: two chibi anchors, weather map, ticker, and a **generated paper-cut video for every field report** (no cap on how many) |
| **Classroom 3D** | `classroom3d.html`, `src/class3d/*` | Straight-on Three.js classroom (default for lessons; Isometric view button switches to the Phaser auditorium). Decorated room, two whiteboards the teacher writes on (key points left, worked examples right), a ceiling projector and screen that show live pictures and 19 generated reenactment videos (history, government, science, music, art, math, ELA; characters act out scenes and events). The lesson director has the teacher walk and point at the clip title card, dim the lights and slowly close in on the screen while the video plays, then walk the aisles discussing it with a follow camera. Camera buttons: auto, wide, follow, boards, projector, 3D example, own seat, free orbit. 11 interactive examples (3D cell and pyramid explorers, parabola, pizza fractions, story/sort games, rhythm, color mixing, election, gravity, photosynthesis, printing press) can be done alone or with a classmate who remembers it |
| **People** | `src/hall3d/{rig,avatar,avatarui,roster,social,dialogue,chatui,hallsocial}.ts`, `src/game/{classroom,lessons,runtimeChars}.ts` | Avatar creator, 56 unique named NPCs with memory, two-way conversations, hand-raise Q&A |
| **Flip phone** | `phone.html` | 2D clamshell that opens two ways (flip-up or sideways swivel; drag/swipe the cover, buttons, or keys O / ← →). D-pad + number keypad or touch. Apps: Messages (family, the real teachers and all 56 named NPC students from the roster, friends first with hearts; NPC texts use the same dialogue engine, optional `/api/chat` model and friendship memory as in-game talks, so they remember each other; live class chat between tabs), Calendar + Sheets (local, or Google via an OAuth Client ID in Settings), school schedule (same bell schedule as the hallway), Dictionary + Thesaurus (dictionaryapi.dev + Datamuse, offline fallback), Calculator, Reminders (alerts on the cover screen), Repos (GitHub API). Shell: 📱 button or P. Also a standalone installable web app at `/phone` (PWA: `phone.webmanifest`, `phone-sw.js` offline shell, `phone-icon.svg`; Netlify build includes it). Also: Homework app (streak, subject colors; the teacher's end-of-class homework lands here), favorites row and home pages, real faces for NPC contacts, send a news story to a friend, captions + read-aloud narration for report videos (the video's mute button mutes the voice), quiet hours, a PIN for Settings, dark mode and larger text, touch buttons in place of the keypad (automatic on touch screens), and a read-only parent page (`parent.html?code=…`, homework, schedule and events only, never chats). Optional cloud save (Settings, off by default): anonymous Firebase sign-in, one private document per player at `users/{uid}/phone/state` (chats, reminders, events, sheet, name/grade/sound; never tokens), Google sign-in to carry it between devices, and a delete button. Config in `firebase-config.js`, security rules in `firestore.rules` (paste into the Firebase console). Game events reach it through the shell (`unify:event` becomes `phone:event`): the teacher's end-of-class homework (text + Reminder + Calendar entry) is the only automatic text; the phone never texts you on its own otherwise. Also the game clock and an unread badge on the 📱 button. Host messages: `phone:clock {minutes}`, `phone:message {from,text}`, `phone:event`, `phone:open` |
| **Feed service** | `server/server.mjs` | Static server + `/api/broadcast` (weather + every local/national/world story for the viewer's place and AM/PM edition) + optional `/api/chat` |
| **Art pipeline** | `tools/` | Python (Pillow + numpy) generators for every PNG, with the paper-cut finish applied on save |

## How they connect
- **Hallway → Auditorium.** Every classroom is a lecture auditorium (`docs/UNIFY_AUDITORIUM_BIBLE_UPDATE.md`). Walk into a doorway and the hallway posts `unify:enter`; the shell opens the auditorium and starts that subject (`unify:lesson`). Each block has one door with its subject sign, so any class is reachable at any time (use **Go to** to walk there). Students walk to the doors during class and fill the hall at arrival, lunch and dismissal. **Leave auditorium** (or Esc) returns you to the spot in front of the door.
- **Newsroom.** `news.html` calls `/api/broadcast` on the same origin; without it the page shows sample content (badge: `SAMPLE DATA` / `LIVE FEED`).
  - *Where and when:* the page asks for the browser's location once (or take a typed city), sends `lat/lon/tz`, and the server returns that place's **morning or evening edition** (AM = since 6 pm yesterday, PM = since 6 am today, widened if a window is thin). Query params: `city | lat,lon`, `tz`, `edition=am|pm`, `grade`, optional `limit` (default: no limit). It refreshes every 10 minutes and slips new stories in after the current report.
  - *Sources:* Google News (geo + search for the place, nation topics, world), PBS, NPR, ABC, CBS, NBC, Guardian, BBC (+ regions), Al Jazeera, DW, France 24, UN News; BBC Newsround for grades K-5. Kid-safety filtering follows the avatar's grade band.
  - *Classroom sources by grade* (the `learn` tier and a Watch & learn row, in the newsroom and the phone's News app): K-5 DOGOnews articles + PBS KIDS link; 6-8 PBS NewsHour Classroom lessons + CNN 10 link; 9-12 PBS NewsHour Classroom + PBS Student Reporting Labs. CNN 10 and PBS KIDS have no usable feed, so they are links.
  - *Video studio* (`src/news/studio.ts`): every report in the rundown is rendered to a WebM by a background queue (two at a time, real time, about 16 s each, paused while the tab is hidden) and kept in an on-device IndexedDB library with a poster frame. A video is reused while its story, edition label and `VIDEO_VERSION` are unchanged; changed or new stories are regenerated on each feed refresh, stale ones are pruned after a day (cap 80). The newsroom has a Video library panel (play, save, redo, regenerate all, pause, auto toggle); the phone's story view has Watch video (with a full-screen mode), which reuses the library or renders on demand.
  - *Generated videos* (`src/news/video.ts`): each story becomes a short animation built from its own words: a topic scene with a field reporter, a figures shot only if the text contains numbers, a quote shot, a map with a pin for a place named in the text (`gazetteer.ts`), and a title card. **Save report as video** downloads it as WebM. Offline demo of the whole pipeline: `UNIFY_MOCK_FEEDS=1 npm start`.
  - The rundown lists every report with tier filters and search; tap one to jump.
- Every page also runs standalone (doorways then just show a hint).

## Art style
See `docs/ART_STYLE.md`: soft cut edges, paper-core rims, drop shadows, sheet curl, one shared kraft palette and a screen-level grain overlay on every page. `UNIFY_PAPER=0 npm run assets` regenerates the previous flat look.

## Scripts
- `npm run build` bundles the auditorium (`demo/dist/bundle.js`, Phaser included) and both hallways (`hall3d.js` with Three.js, `hall.js`); also runs on `npm install`.
- `npm run typecheck`; `npm run assets` runs the art pipeline (needs Python 3.10+, `pip install pillow numpy`). Isometric hallway art: `tools/gen_hall.py` + `tools/layout_hall.py` (the 3D campus is laid out in `src/hall3d/campus.ts`: blocks, doors, lockers, props and the nav grid).
- `python3 tools/bake_chibi.py` redraws the auditorium characters with the hallway's chibi rig. `python3 tools/build_artifact.py OUT_DIR` writes a relative-path copy for plain file hosts.
- Feed env: `PORT`, `SCHOOL_CITY` (fallback city), optional `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` (anchor copy for every story, and live NPC replies to typed text via `/api/chat`; without a key the local dialogue engine answers).
- `UNIFY_MOCK_FEEDS=1` serves built-in fixtures so the newsroom pipeline runs without internet.

## Docs
`docs/`: auditorium Bible update, pipeline README, art style, broadcast integration notes. `prototypes/newsroom-enhanced.html` is the reference newsroom. The earlier top-down `school-sim.html` / `school-sim-cartoon.html` prototypes were removed (nothing linked to them); they remain in git history: `git checkout 26c11b8 -- school-sim.html school-sim-cartoon.html`.

## Known gaps
- Newsroom anchors are drawn live in vector (same palette, shadows and grain, not the pipeline sprites).
- The live feed could not be exercised from the build sandbox (outbound hosts blocked); it falls back to sample data.
- Hallway NPCs do not use lockers or benches yet (they walk and stand).
- Diagonal directions in the auditorium sheets are the front/back chibi view with the head turned, not a true three-quarter drawing.
- Performance was only measured with software rendering; profile on a real phone.
- `tools/gen_decor.py` / `gen_fpv.py` output (`decor`, `fpv`, `textbook`) is not used at runtime.

- Netlify: `python3 tools/build_netlify.py OUT_DIR --zip` builds a deployable site (static game + the news feed as a Netlify Function at `/api/broadcast`).

## Deploy on Netlify from Git
The repo root `netlify.toml` builds from source (`npm run build`, then `tools/build_netlify.py dist`), publishes `dist/` and serves the news feed as a function at `/api/broadcast`. In Netlify: Add new project > Import from GitHub > choose this repo and branch. No settings needed; optional env vars `SCHOOL_CITY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`. New sites are public by default (team-only visitor access is a per-site setting under Site configuration > Access & security).

## People, memory and conversations
- **Avatar creator** (Avatar button; shown on first visit): body (grade band sets height, build, head size, skin), face (eye shape and colour, brows, mouth, freckles, glasses styles), 19 hair styles with colour and highlights, outfit (9 tops, patterns, bottoms, shoes), extras (hats, bag, earrings, scarf, badge), name and pronouns, with a live turn-around and walk preview. It is used for your character in the campus **and** in the auditorium (baked at runtime).
- **56 unique NPCs** (`roster.ts`): each has a name, grade, look, personality, interests, favourite and hardest subject, food, pet, dream, quirk, secret and a best friend or rival. Looks are checked for uniqueness. Staff (hall monitor, teacher, four subject teachers) are adults.
- **Memory** (`social.ts`, localStorage `unify.social.v1`, shared by all pages): friendship, how often you talked, topics, facts you told them (hobby, favourite food or subject, pet, mood), quiz results, lunch buddies. NPCs greet you by name, ask how your hobby is going, remember when you helped them, and friends walk up to say hi. **Friends** (F) lists everyone you met.
- **Conversations** (tap a person or press T): choose a reply or type your own. Topics: how are you, subjects, hobbies, about me, food, gossip (grounded in the roster and other NPCs' memories), compliments on what they actually wear, jokes, studying with quiz questions by grade, advice, lunch invitations. Hallway chatter bubbles also come from the roster.
- **Hand raising** (auditorium, H or the button): the teacher asks questions, classmates raise their hands and answer (sometimes wrongly), and you can volunteer to answer or help someone, or raise your hand to ask the teacher to explain again, give an example, say why, define a word, or answer your own typed question. Teachers remember what you asked. Tap a seated classmate to whisper.

## Faculty and CarryingCareers

- **Teachers (online-completable classes only):** Mr. Tanaka (math), Ms. Ayrissa (ELA), Ms. Okafor (science), Mr. O'Brien (history) and Mr. Haddad (CarryingCareers). Ms. Park (computer science), Dr. Larsen (biology) and Mrs. Raman (English literature) are on hall duty. PE, band and studio art are not added because they cannot be completed online. Data and rotation live in `src/hall3d/faculty.ts`.
- **Daily looks:** each teacher has 5 hairstyles and 5 outfits chosen by a weekly shuffle, so nothing repeats Monday to Friday (weekends repeat Monday and Tuesday).
- **CarryingCareers:** one classroom for every career path, any type: finding your path; building and moving things; caring, teaching and helping; safety, law and government; technology, science and engineering; business, money and sales; arts, media and hospitality; food, farms and nature; making a plan; pay, paths and choices. Together they cover all 16 career clusters. Lessons are in `src/class3d/curriculum.ts`.
- **Spoken lessons:** `src/class3d/voice.ts` (browser speech, per-teacher voices, mute button in the classroom).
- **Moods and gestures:** `src/class3d/persona.ts` (smile, joy, frown, upset, frustration, surprise, thinking, stern).
- **Sizes:** adults are 1.4 world size, students 0.9 and smaller by grade (`AGE_SCALE` in `src/hall3d/characters.ts`).

## Class times, lessons that open up, and the new-student assessment

- **Class times board:** a corkboard on the hallway plaza (and one on each classroom's right wall) shows today's picked time and lesson number for every class. Press **B** near it or use **Class times** in the hallway or classroom menu. Each class offers 5 random session times a day, or Morning, Noon and Evening set times; the pick goes on the phone's schedule.
- **Get ahead:** finishing a lesson opens the next one for that class (**More > Next lesson**).
- **Life Lessons** (Dr. Larsen): 14 lessons on money, budgets, credit and scams, home care, cooking, health, feelings, safety, digital privacy, relationships and consent, time, adult paperwork, getting around, and decisions.
- **New-student assessment** (`src/game/placement.ts`): finds age and grade band, then a level in math, ELA, science and history with adaptive questions. It then sets a starting point for **extra lessons** (`src/class3d/catchup.ts`, 24 bridge lessons for K-2, 3-5 and 6-8) that run beside regular classes: they show in each classroom's More menu and can be booked at set times in Class times. It is off for demo runs; turn on "Ask new students" in the classroom More menu, or take it any time from More or the hallway Me menu.
- **Voices** stay the same per person: each voice choice is saved and kept distinct between teachers.

## Curriculum packs, textbook and electives
Bring in a whole curriculum with a pack (Markdown or JSON): lessons, a **script the teacher performs** (spoken lines with moods and gestures, board writing, questions, "open your textbook" cues), and a **textbook** to read in depth.
Packs ship in `curriculum/` (listed in `curriculum/index.json`) or are imported in class under **More → Curriculum packs**. Format and examples: `curriculum/README.md`.
In class: **More → Textbook** (chapters, search; every class also has auto-made class notes), **More → Electives** (extra courses such as the bundled high-school electives: Algebra I, Geometry, Statistics, Computer Science, Psychology, Public Speaking, Journalism, Economics, Test Prep, Applications, Study Skills).
The class-times bulletin board: classroom **Camera → Bulletin board**, hallway **Go to → Class-times board** (or key **B**).

## Class pet, daily moments, stamps, study buddy, dorm rewards, parent weekly summary
- **Class pet** (`src/class3d/pet.ts`): a play pen in the front-left corner of the classroom. Pick a rabbit, hamster, turtle or guinea pig, name it, and feed it once a day (the chip at the bottom left). Kept on the device (`unify.pet.v1`) and synced to the family account. Feeding counts as a daily quest.
- **Moment of the day** (`src/hall3d/daily.ts`): a short, kind announcement at morning arrival that changes every day (14 of them, never the same two days in a row).
- **Lesson stamps** (`src/game/stamps.ts`): finishing a lesson shows "Stamp 4 of 20 in Math" with a star bar; the 5th, 10th, 20th and last stamp are milestones.
- **Study buddy "Sparky"** (`src/game/buddy.ts`): the "Need a hint?" button in class gives a nudge, then a strategy, then points to the teacher, then teach-it-back questions. Hints only, never answers, and no AI is needed.
- **Dorm rewards** (`src/dorm/rewards.ts`): Pet cage (feed the pet 3 times), Spirit pennant (3-day quest streak) and Champion cup (5-day streak) are listed in the dorm's Add furniture only once earned.
- **Parent weekly summary** (`src/game/weekly.ts`, shown on `parent.html`): a short, positive "This week" note per child (class days, lessons finished, quest streak, pet, rewards). It never shows scores or compares children.
- Seasons and weather already come from `src/game/world.ts` and `src/hall3d/weatherfx.ts`; clubs from `src/game/community.ts`.
- Tests: `node tests/class-pet.test.mjs`, `daily-moment`, `stamps`, `buddy`, `dorm-rewards`, `weekly` (the browser ones need `SMOKE_CHROMIUM` and a build).
- **Club Corner** (`clubs3d.html`, `src/clubs3d/ClubRoom3D.ts`, `demo/clubs3d.ts`): a 3D room with a table per club, a weekly schedule board (today highlighted, today's clubs glow) and a green check on the clubs you joined. Tap a table or use the list at the bottom to read about a club, join or leave it, and open the existing clubs and meetings screen. Reached from the Today panel's "Club Corner" button. Test: `node tests/club-room.test.mjs`.
- **Stamp card** (Today panel, `src/hall3d/hubui.ts`): one row per subject with stars and n/total. The classroom saves the real lesson totals (`unify.lessoncounts.v1`) once the lesson packs have loaded; until then a subject just says how many lessons are finished.


---

UNIFY Academy school app. Replaces the earlier Campus Quest app (still in git history). Build: see netlify.toml; Pixar edition: python3 tools/build_pixar_app.py (docs/PIXAR_APP.md).
