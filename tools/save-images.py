"""Save the web images used in question files into the project.

Run from the Quizulu folder:

    python tools/save-images.py

For every "Image: https://..." line in questions/*.txt (picture choices like
"*B. Image: https://..." too) it downloads the picture to
questions/images/<subject>/<name> (lowercase names, so GitHub Pages finds them) and
rewrites the line to "Image: images/<subject>/<name>".

It also checks that every local image path exists with exactly the same capital letters.
Windows ignores capitals but GitHub Pages doesn't, so a mismatch would break only online.
"""

import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QUESTIONS = ROOT / "questions"
# "Image: x" lines, including picture choices like "*B. Image: x".
IMAGE_LINE = re.compile(r"^(\s*(?:\*?\s*[A-Za-z]\s*[.)]\s*\*?\s*)?image\s*:\s*)(\S.*?)\s*$", re.IGNORECASE)
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"


def local_name(url):
    """WordPress upload URLs become <year>-<month>-<file>, lowercase and web-safe."""
    path = urllib.parse.unquote(urllib.parse.urlparse(url).path)
    m = re.search(r"/uploads/(\d{4})/(\d{2})/([^/]+)$", path)
    name = f"{m[1]}-{m[2]}-{m[3]}" if m else path.rsplit("/", 1)[-1]
    name = re.sub(r"[^a-z0-9._-]+", "-", name.lower()).strip("-.") or "image"
    return name if "." in name else name + ".png"


def download(url, dest):
    parts = urllib.parse.urlparse(url)
    request = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Referer": f"{parts.scheme}://{parts.netloc}/",
    })
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)


def exists_exactly(base, rel):
    """Like (base / rel).exists(), but also checks capital letters (Windows ignores them).

    Compares each folder/file name as written, because Path.resolve() on Windows
    would quietly fix the capitals and hide the mismatch.
    """
    folder = base
    for part in Path(rel).parts:
        if part == ".":
            continue
        if part == "..":
            folder = folder.parent
            continue
        if not folder.is_dir() or part not in {child.name for child in folder.iterdir()}:
            return False
        folder = folder / part
    return True


def main():
    downloaded = reused = 0
    problems = []

    for file in sorted(QUESTIONS.glob("*.txt")):
        if file.name.lower() == "subjects.txt":
            continue
        with open(file, encoding="utf-8", newline="") as f:
            text = f.read()
        newline = "\r\n" if "\r\n" in text else "\n"
        lines = text.split(newline)
        subject = re.sub(r"[^a-z0-9_-]+", "-", file.stem.lower())
        changed = False

        for i, line in enumerate(lines):
            m = IMAGE_LINE.match(line)
            if not m:
                continue
            target = m[2]
            where = f"{file.name}, line {i + 1}"

            if re.match(r"https?://", target, re.IGNORECASE):
                rel = f"images/{subject}/{local_name(target)}"
                dest = QUESTIONS / rel
                if dest.exists():
                    reused += 1
                else:
                    try:
                        download(target, dest)
                        downloaded += 1
                        print(f"  saved {rel}")
                    except Exception as error:  # keep the web link; report and move on
                        problems.append(f"{where}: couldn't download {target} ({error})")
                        continue
                lines[i] = m[1] + rel
                changed = True
            else:
                base = ROOT if target.startswith("questions/") else QUESTIONS
                if not exists_exactly(base, target):
                    hint = " (the capital letters don't match the file)" if (base / target).exists() else ""
                    problems.append(f"{where}: image not found: {target}{hint}")

        if changed:
            with open(file, "w", encoding="utf-8", newline="") as f:
                f.write(newline.join(lines))

    print(f"\nDownloaded {downloaded} image(s), {reused} already saved.")
    if problems:
        print(f"\n{len(problems)} problem(s):")
        for problem in problems:
            print(f"  - {problem}")
        sys.exit(1)
    print("All images OK.")


if __name__ == "__main__":
    main()
