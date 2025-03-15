# Building the DNA Viewer

Follow these instructions to create a single executable file that you can share with others.

## Requesting Data

1. Request your DNA data
   - Go to your [Ancestry Settings](https://www.ancestry.com/dna/settings)
   - Click on your name
   - Scroll to the bottom
   - Click on "Download DNA data"
   - Click through requesting the data
2. Wait for the email from Ancestry
   - Wait about 30 minutes
   - Click the link in the email
   - Click "Download DNA data"
3. Extract the zip file
4. Run the `DNAViewer.exe` program

## Prerequisites

- Go 1.16 or later installed

## Step 1: Set Up Your Project Structure

Create the following project structure:

```sh
dnaviewer/
├── main.go              # Main server file
├── go.mod               # Go module file
├── model/               # DNA data models
│   └── dna.go           
├── parser/              # File parser
│   └── parser.go        
├── search/              # Search algorithms
│   └── search.go        
└── web/                 # Web interface files (embedded in the executable)
    ├── index.html       # HTML interface
    ├── style.css        # CSS styling
    └── app.js           # JavaScript code
```

## Step 2: Update Dependencies

Update your go.mod file:

```bash
go mod init github.com/yourusername/dnaviewer
go mod tidy
```

## Step 3: Build the Executable

Run the following command to build a single executable file:

### For Windows

```bash
go build -ldflags="-s -w -H=windowsgui" -o DNAViewer.exe
```

The flags explained:

- `-s -w`: Reduces the binary size by removing debug information
- `-H=windowsgui`: Hides the terminal window when running the application

To compile for Windows on an alternate system:

```bash
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o DNAViewer.exe
```

### For MacOS

```bash
GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -o DNAViewer
```

### For Linux

```bash
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o DNAViewer
```

## Step 4: Test the Executable

Run the executable by double-clicking it. It should:

1. Start a local web server
2. Automatically open your default browser
3. Display the DNA Viewer interface

## Step 5: Distribution

You can now distribute the single executable file (`DNAViewer.exe` for Windows) to others. When they run it:

- No installation is required
- The application will open in their default browser
- All functionality works without any additional dependencies

## Important Notes

1. **Security Settings**: On Windows, the executable might trigger SmartScreen on first run. The recipient may need to click "More info" and "Run anyway".

2. **Firewall Access**: The application needs to access localhost, which most firewalls allow by default. However, if users encounter issues, they may need to allow the application through their firewall.

3. **File Size**: The executable will be 10-15 MB due to the embedded web resources and Go runtime.

4. **Browser Requirement**: A modern web browser is required (Chrome, Firefox, Edge, or Safari).
