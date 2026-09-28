# Running Anaglyph & Friends locally

[Back to the main README](../README.md)

The public web edition is the easiest way to use Anaglyph & Friends:

https://anaglyph-and-friends.onrender.com/

The local edition is useful when you want offline processing, the Python/PyTorch Depth Anything V2 pipeline, or direct access to the development environment.

## New to GitHub? Start here

You can use the **hosted web edition** without installing anything, or run the **local edition** on your own computer. The local edition is not yet a normal double-clickable Mac app, so its first setup uses Terminal.

The beginner guide below is for **macOS**, which is the environment this version has actually been tested on. Windows and Linux should use the same overall architecture, but some installation and virtual-environment commands differ.

### The basic mental model

There are four pieces:

1. **GitHub** stores the project. `git clone` copies it onto your Mac.
2. **Python / Flask** runs the backend that creates the depth map and 3D images.
3. **Node / Vite** runs the frontend that you see in your web browser.
4. The backend and frontend each stay running in their own Terminal window while you use the app.

Everything runs on your own computer. After the software and AI model have been downloaded once, image processing can work offline.

### 1. Check the required software

You need:

- **Git**
- **Python 3.10.x** - tested with Python 3.10.4
- **Node.js 20 or newer**, including npm - tested with Node 24.20.0

Open **Terminal** on your Mac and paste these commands one at a time:

```bash
git --version
python3 --version
node --version
npm --version
```

If all four print version numbers, continue to the next step.

If `git --version` causes macOS to offer to install Command Line Developer Tools, accept that installation and then try the command again.

If Python is missing or is not a Python 3.10 release, install Python 3.10 from [python.org](https://www.python.org/downloads/). If Node or npm is missing, install a current Node.js release from [nodejs.org](https://nodejs.org/).

### 2. Copy Anaglyph & Friends to your Mac

The following puts it on your Desktop. In Terminal:

```bash
cd ~/Desktop
git clone https://github.com/udeudeude/Anaglyph-and-Friends.git
cd Anaglyph-and-Friends
```

`git clone` is simply GitHub's way of saying "make a local copy of this project and remember where it came from."

If you prefer GitHub's **Code -> Download ZIP** button, that can also give you the files, but cloning is recommended because later updates are then as simple as `git pull`.

### 3. Add Depth Anything V2 and its AI checkpoint

Anaglyph & Friends uses the official **Depth Anything V2 Small** model. From the `Anaglyph-and-Friends` folder, paste:

```bash
mkdir -p backend/ai_models

git clone https://github.com/DepthAnything/Depth-Anything-V2.git backend/ai_models/Depth_Anything_V2

mkdir -p backend/ai_models/checkpoints

curl -L https://huggingface.co/depth-anything/Depth-Anything-V2-Small/resolve/main/depth_anything_v2_vits.pth -o backend/ai_models/checkpoints/depth_anything_v2_vits.pth
```

The final download is the neural-network checkpoint and may take a while. When this step is complete, these locations should exist:

```text
backend/ai_models/Depth_Anything_V2/depth_anything_v2/...
backend/ai_models/checkpoints/depth_anything_v2_vits.pth
```

### 4. Set up and start the backend

This part only needs to be **installed once**. In Terminal:

```bash
cd ~/Desktop/Anaglyph-and-Friends/backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python app.py
```

The first dependency installation can take several minutes.

When the virtual environment is active, your Terminal prompt will usually begin with `(.venv)`. That is expected.

When the backend is ready, you should eventually see a line similar to:

```text
* Running on http://127.0.0.1:8000
```

Leave this Terminal window open and running. Messages such as `xFormers not available` can be informational and do not by themselves mean the backend failed.

#### Intel Mac note

Some Intel Macs expose PyTorch's MPS GPU support but do not implement every operation used by Depth Anything V2. Anaglyph & Friends enables PyTorch's **CPU fallback** for unsupported MPS operations while keeping supported work on MPS. This preserves the aspect ratio of the source image without requiring the whole model to run on CPU.

If MPS causes trouble on a particular Mac, you can force the backend to use only the CPU:

```bash
AAF_TORCH_DEVICE=cpu python app.py
```

### 5. Set up and start the frontend

Open a **second Terminal window**. Leave the backend running in the first one.

In the new Terminal:

```bash
cd ~/Desktop/Anaglyph-and-Friends/frontend
npm install
npm run dev
```

When Vite is ready, it normally shows:

```text
http://localhost:5173
```

Leave this second Terminal running too.

### 6. Open the app

Open your web browser and go to:

[http://localhost:5173](http://localhost:5173)

You should now see **Anaglyph & Friends**. Drop, choose, or paste an image into the source panel and the app will create its depth map and selected 3D output.

### Starting it again later

You do **not** repeat the installation steps every time.

On macOS, after the one-time setup above is complete, you can use the small launchers in the repository's `macos` folder:

- double-click **Anaglyph & Friends.app** to start both local servers and open the browser;
- double-click **Stop Anaglyph & Friends.app** when you are finished.

They use your existing local Python environment, Node installation, model files, and dependencies. They are deliberately small launchers rather than a self-contained signed distribution. Because they are not notarized, macOS may require **Control-click -> Open** the first time.

You can still start the components manually. Open one Terminal window for the backend:

```bash
cd ~/Desktop/Anaglyph-and-Friends/backend
source .venv/bin/activate
python app.py
```

Open a second Terminal window for the frontend:

```bash
cd ~/Desktop/Anaglyph-and-Friends/frontend
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

Use **Control-C** in a Terminal window when you want to stop the server running there.

### Updating to the newest GitHub version

Stop the backend and frontend with **Control-C**. Then in one Terminal:

```bash
cd ~/Desktop/Anaglyph-and-Friends
git pull
```

Usually you can then restart normally. If an update added or changed dependencies, it is safe to refresh them with:

```bash
cd ~/Desktop/Anaglyph-and-Friends/backend
source .venv/bin/activate
pip install -r requirements.txt

cd ../frontend
npm install
```

Then start the backend and frontend again as described above.

### Asking ChatGPT for help with an error

Useful information to include is:

- the URL of this repository;
- your operating system and Mac model if known;
- which numbered setup step you reached;
- the exact Terminal command you entered;
- the complete error message, preferably copied and pasted rather than paraphrased.

A useful prompt is:

> I am trying to run https://github.com/udeudeude/Anaglyph-and-Friends on my Mac. I am new to GitHub. I got the following error during setup. Please explain what it means and give me only the next step to try: [paste error here]
