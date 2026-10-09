# Quizulu

A review site: pick a subject, tick the quizzes / formatives / midterms / modules you want, and answer.
All questions live in plain text files in the `questions/` folder. The site is hosted on GitHub Pages.

## Importing from itexamanswers.net (fastest)

1. **Install the bookmark once:** run the local preview (see below), open
   http://localhost:5173/tools/bookmarklet.html and drag **Copy to Quizulu** onto your bookmarks bar
   (Chrome or Brave). Once the site is on GitHub you can also use `https://<you>.github.io/<repo>/tools/bookmarklet.html`.
2. Open an exam page on itexamanswers.net and click **Copy to Quizulu**. A panel shows how many
   questions it found: normal multiple choice, plus "Show answer" cards for questions that can't be
   multiple choice (matching, fill-in…). Question numbers match the page.
3. Set the **Type** (Module, Quiz, Final…) and a short **Title** (e.g. `Module 18-20`), then **Copy to clipboard**.
4. Make a new file in `questions/` (e.g. `Modules18-20.txt`), type `# DEV OPS` on the first line, and paste
   below it. The copied text already has its own `## Module:` heading, so don't type another one.
   Then add the file name to `questions/subjects.txt`.
5. If the panel said some questions have images, save them into the project:

   ```bash
   python tools/save-images.py
   ```

   This downloads every `Image: https://…` picture into `questions/images/`, points the question at
   the local copy, and warns about image paths whose capital letters don't match (those would break on GitHub).
6. Refresh the site to check, then commit and push.

If the importer is ever updated, delete the old bookmark and drag the button again.

## Writing questions by hand

Each subject is one `.txt` file in `questions/`. Example:

```
# Biology

## Quiz: Quiz 1 – The Cell

1. What is known as the powerhouse of the cell?
A. Nucleus
*B. Mitochondria
C. Ribosome
D. Golgi apparatus

2. Refer to the exhibit. Which commands are needed? (Choose two.)
Image: images/biology/exhibit-2.png
*A. hostname R1
*B. line con 0
> login
C. reload
```

| Line | Meaning |
|---|---|
| `# Biology` | Subject name (once, at the top) |
| `## Quiz: Quiz 1 – The Cell` | Starts a new set. The word before `:` is the type (Quiz, Formative, Midterm, Module, Final… anything) and sets are grouped by it. The rest is the title. |
| `1. Question text` | A question. |
| `> more text` | Continues the question, or the choice right above it, exactly as written (good for command output or multi-line answers). |
| `Image: images/x.png` | A picture shown above the choices. Path is relative to the `questions/` folder; a full `https://` link also works. Tap the picture to see it full size. |
| `A. Choice` | A choice. Letters must go in order: A, B, C… (up to J). |
| `*B. Choice` | A correct choice. **1 star = normal question. 2–3 stars = "Choose 2" / "Choose 3".** |
| `C. Image: images/x.png` | A picture as a choice (it can be starred like any choice). |
| `Answer: text` | Makes a **"Show answer" card** instead of multiple choice: no lettered choices, the student taps Show answer and marks themselves "I got it" / "I missed it". `>` and `Image:` lines under it belong to the answer. |
| `// note` | A comment. It's ignored. |

Good to know:
- Question numbers don't need to be in order; questions are shuffled anyway.
- `(Choose two.)` in a question is removed (the site shows its own "Choose 2") and checked: if it doesn't
  match the number of stars, the question is flagged.
- Choices are shuffled too, except **"All/None of the above"** stays last, and questions with choices like
  **"Both A and B"** keep their original order.
- Multi-answer questions are all-or-nothing: the student must pick exactly the starred choices.
- If something in a file can't be read, a yellow box on the site lists the file and line number.
  It's open by default when you preview on your computer.
- **Capital letters matter on GitHub** (not on Windows): `Images/X.png` and `images/x.png` are different files online.

### Adding a new file

You can keep one file per exam. Files that start with the **same `# Subject` line** join into one
subject on the home page (e.g. `Modules5-10.txt`, `Modules11-12.txt` and `Modules13-17.txt` all start
with `# DEV OPS`, so they show as one "DEV OPS" folder with three sets).

1. Create the file in `questions/` and start it with the subject line, then the set heading:
   ```
   # DEV OPS

   ## Module: Module 18-20
   ```
2. Add the file name as a new line in `questions/subjects.txt`. The site only loads files listed there.
   Type the name exactly, capital letters included.

A different `# Subject` line makes a new subject tile.

## Preview on your computer

Double-clicking `index.html` won't load the questions (browsers block that). Run a tiny server from this folder:

```bash
python -m http.server 5173
```

Then open http://localhost:5173. Refresh the page after editing a question file.

## Publishing on GitHub Pages

1. Put this folder in a GitHub repository (GitHub Desktop is easiest: **File → Add local repository**, then **Publish repository**).
   Free GitHub Pages needs the repository to be **public**.
2. On github.com open the repository → **Settings → Pages** → Source: **Deploy from a branch**, branch **main**, folder **/ (root)** → Save.
3. After a minute the site is live at `https://<you>.github.io/<repo>/`. Share that link.

To update: edit or import questions, then **commit** and **push**. Changes show up within a few minutes.
