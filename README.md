data How to use this to App

This document outlines the steps to create `qrdata.yaml` for the Contact Carousel application and publish it to GitHub Pages.

## 1. Creating `qrdata.yaml`

The `qrdata.yaml` file contains the qrcode data that will be used by the application. It should be structured as a YAML array of objects, where each object represents a qrcode.

**Example `qrdata.yaml`:**

```yaml
- url: "https://johndoe.example.com"
  description: |
    John Doe is a software engineer.
    He works on web development and loves React.
- url: "https://janesmith.example.com"
  description: |
    Jane Smith is a data scientist.
    She specializes in machine learning and data visualization.
- url: "https://peterjones.example.com"
  description: |
    Peter Jones is a graphic designer.
    He creates beautiful user interfaces.
```

**Structure:**

* `-`: Indicates an array item.
* `url`: The URL of the qrcode (string).
* `description`: A multi-line string containing the qrcode description (using `|`). You can use Markdown syntax within the description.

**Steps:**

1.  **Create the File:** Create a file named `qrdata.yaml` in the `data/` directory of your project's root.
2.  **Add QR Data:** Add the QR data in the YAML format shown above.
3.  **Save the File:** Save the `qrdata.yaml` file.

## 1a. Editing `qrdata.yaml` in the app

You do not have to hand-edit the file. Load a `qrdata.yaml` and press the
**Edit** button (the pencil, which shows the current file name) to add, change,
delete, and reorder entries.

* **Save** writes back to the file you opened. Chrome and Edge only - see
  *Browser support* below.
* **Save As** writes a new file and leaves the original untouched. It suggests a
  timestamped name derived from the current file (`qrdata-20260825-143210.yaml`),
  so repeated saves do not silently overwrite one another. Where **Save** is not
  offered, this downloads the new file instead.
* **Switch** opens a different `qrdata.yaml`.
* **Print** puts the current code and its description on one portrait page, in
  black and white. The code takes 80% of the page width - the same share it gets
  of a phone screen - which is about 144mm on A4. Controls, the version footer
  and the entry's background colour are all left off. If the entry's colour was
  pale enough that the code on screen was tinted to match, a plain
  black-on-white code is printed instead - the tint is part of the image, so no
  stylesheet could remove it.

  The page margin is 15mm, but **the browser's print dialog wins**. If the
  printed page has no margin at all, check that dialog's *Margins* setting is
  not on *None* - that silently overrides the `@page` rule and nothing in the
  app can put the margin back.
* **?** opens a short help panel.

### Background colours

Each entry can carry its own page background:

```yaml
- url: https://example.com
  description: |
    Our office
  background: '#ffe8d6'
```

* **Quote it.** In YAML a `#` starts a comment, so `background: #ffe8d6`
  unquoted is read as an empty value and the colour silently disappears. The app
  always writes the quotes; only hand-edited files can get this wrong, and the
  editor points it out when they do.
* **Hex only** - `#rgb` or `#rrggbb`. Not `navy`, not `rgb(...)`. The editor
  offers a row of presets and a colour picker, so this only matters if you are
  editing the file by hand.
* **The text colour follows the background** automatically: light backgrounds get
  dark text, dark backgrounds get light text.
* **The background is drawn into the QR code itself**, so the code blends into
  the page instead of sitting on a white square - but only while the colour
  stays light enough for the black modules to read against it. Every preset
  clears that bar; the editor shows the number for whatever you pick and warns
  when a custom colour falls below it.
* **The bar is relative luminance 0.5**, which is about 11:1 against black - far
  stricter than text needs, because a code a camera cannot read still looks
  perfectly fine on a screen. It is not uniform across hues: luminance weights
  green at 0.72 and blue at 0.07, so a yellow or a green clears it while still
  looking saturated, where a blue or a red has to be a genuine pastel. As rules
  of thumb, every hex pair at `c0` or above always clears it, and every pair at
  `bb` or below never does.
* The editor names the colour under the swatch row, since the swatches
  themselves carry no text and the palest of them barely change a light page.
* An entry with no `background` key follows the phone's light or dark setting. An
  entry **with** one looks the same either way - the colour is your choice about
  how that card looks, not a theme for the viewer's phone to override.

### Logos

Every code carries a mark in the middle. By default it is the QRousel one; an
entry may set its own, and a file may set a default for all of its entries:

```yaml
logo: data:image/png;base64,iVBORw0KGgo=   # the default for this file
entries:
  - url: https://example.com
    description: Our office
    logo: data:image/png;base64,…          # this card overrides it
  - url: https://example.com/other
    logo: none                             # this card has no mark at all
```

* **The wrapper is optional.** A file that is just a list of entries - which is
  every file written before this existed - still works exactly as before, and is
  written back as a list. The `logo:`/`entries:` shape only appears once there is
  a file-level default to carry.
* **`none` opts out**, on an entry or on the whole file. An entry with its own
  logo still shows it in a file that opted out.
* **Only `data:` images.** A logo living in the file costs no request and cannot
  disappear; an `https:` one would tell that server every time somebody looks at
  your card.
* **Codes are generated at error correction level H** so there is room to
  reconstruct what the mark covers. Codes are denser as a result.
* **The mark covers 20% of the width**, which was measured rather than chosen: a
  bare phone number makes a small code whose middle is close to the structural
  timing patterns, and it stops decoding above that. There is an automated test
  that decodes generated codes to check this stays true.

### Browser support

Every browser can open a `qrdata.yaml`, view the codes, edit the entries, and
write them out.

Chrome and Edge additionally implement the [File System Access
API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API),
which is what lets the app hold on to the file you opened and write straight
back to it. That is the only thing **Save** needs, and the only thing other
browsers cannot do.

In Firefox and Safari the app falls back to a plain file input and a download:

* Opening gives the app a *copy* of the file, so there is nothing to write back
  to and **Save** is not offered - the editor says so in place of the button.
* **Save As** hands the file to your browser's downloads instead of asking where
  to put it. Nothing comes back from a download, so the app cannot tell you
  where the file landed or whether you renamed it on the way; it assumes the
  name it asked for.
* Replacing your original means moving the downloaded file over it yourself.

**Saving rewrites the whole file, and comments do not survive.** The app parses
the YAML into entries and writes fresh YAML back out, so comments, blank lines,
and quoting style in a hand-written file are lost. The entries themselves - and
any extra keys on them - are kept. The app warns you once before it overwrites a
file it did not write; choose **Save As instead** if you want to keep the
original.

If you keep annotated `qrdata.yaml` files, either keep the annotated copy
somewhere the app does not write to, or accept that editing in the app is the
point at which the comments go.

A `url` is not limited to a web address. Any QR payload works - `mailto:`,
`tel:`, `WIFI:S=...;`, a vCard, or plain text. Only `http` and `https` payloads
can be opened from the QR contents popup; anything else is shown as text.

After a page reload the app still has your entries, but not the link to the file
they came from, so **Save** is unavailable until you use **Save As** or open a
file again.

## 2. Running the Build Script

The `yaml-to-json.js` script converts the `qrdata.yaml` file into `qrdata.js`.

> **Note:** the running application no longer reads `src/data/qrdata.js`. It loads
> `qrdata.yaml` at runtime through the file picker and remembers it in
> `localStorage`, so this step is not needed to use the app.

**Steps:**

1.  **Run the Script:** Execute the following command in your terminal:

    ```bash
    npm run yaml-to-json
    ```

    This will generate the `src/data/qrdata.js` file.

## 3. Publishing to GitHub Pages

To publish the application to GitHub Pages, follow these steps:

**Prerequisites:**

* You have a GitHub repository for your project.
* You have `gh-pages` installed as a dev dependency (`npm install gh-pages --save-dev`).

**Steps:**

1.  **Set `homepage` (Conditionally):**
    * The `yaml-to-json.js` script will automatically set the homepage within the package.json file when the `REACT_APP_GH_PAGES` environment variable is set.
    * This is done via the `build-gh-pages` script.

2.  **Run the Build Script for GitHub Pages:**

    ```bash
    npm run predeploy
    ```

    This will run the build script, and set the homepage in the package.json.

3.  **Deploy to GitHub Pages:**

    ```bash
    npm run deploy
    ```

    This will create a `gh-pages` branch in your repository and push the contents of the `build` directory to it.

4.  **Configure GitHub Pages:**
    * Go to your repository on GitHub.
    * Go to the "Settings" tab.
    * Scroll down to the "Pages" section.
    * In the "Branch" dropdown, select the `gh-pages` branch.
    * Click "Save."

5.  **Access Your Site:**
    * Your site will be available at `https://${GITHUB_USERNAME}.github.io/${GITHUB_REPO_NAME}/`.

**Example:**

If your GitHub username is `myuser` and your repository name is `qrousel`, your site will be available at `https://myuser.github.io/qrousel/`.

**Important Notes:**

* Replace `${GITHUB_USERNAME}` and `${GITHUB_REPO_NAME}` with your actual GitHub username and repository name.
* The `gh-pages` deployment might take a few minutes to become available.
* If you make changes to `qrdata.yaml`, you must run `npm run yaml-to-json`, `npm run predeploy`, and `npm run deploy` again to update your GitHub Pages site.
* If you run into issues with the gh-pages branch, delete the remote gh-pages branch, and run `npm run deploy` again.

# Developer Documentation

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
