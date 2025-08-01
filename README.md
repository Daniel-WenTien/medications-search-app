# medications-search-app

🩺 Medication Search and Save App
This project is a Node.js application built with Express.js and EJS templates.

🔍 Purpose:
The app allows users to search medications using the RxNorm API, view detailed drug information, and save selected medications into a MySQL database.

⚙️ Key Features:
Search medications by name via the RxNorm API.

Display drug details, including RxCUI, synonym, and type (e.g., SBD, SCD).

Save selected medications to a MySQL table (f_medications).

Auto-fill missing synonym fields with the medication name if needed.

🛠️ Tech Stack:
Backend: Node.js, Express.js

Frontend: EJS templates, Bootstrap (for styling)

Database: MySQL

API Integration: RxNorm REST API

💾 Data Handling Logic:
When saving medications:

Both SBD and SCD types are included.

If the synonym field is empty or null, it is automatically replaced with the medication name before saving.

# Install the dependencies
```sh    
    npm install
```
# To start the project, run:
```sh    
    npm start
```