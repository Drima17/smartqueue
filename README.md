# SmartQueue
## Real-Time Web-Based Hospital Outpatient Queue Management System with Patient Self-Tracking and Dynamic Wait-Time Estimation

**Author:** Arubi David Olikejenyohe  
**Matriculation Number:** FOS/22/23/286446  
**Supervisor:** Dr. A.E. Edje  
**Department:** Computer Science, Delta State University, Abraka  
**Year:** 2026  

---

## Project Description

SmartQueue is a web-based hospital outpatient queue management system that 
replaces manual paper-based queuing with a real-time digital platform. It 
enables receptionists to register patients and generate queue numbers, allows 
doctors to manage the queue from a dedicated dashboard, provides patients with 
a self-tracking interface accessible via a unique URL on any web-connected 
device, and displays the live queue on a waiting-room screen in an 
airport-style board format.

---

## Technology Stack

- **Backend:** Node.js v22, Express.js 4.19
- **Real-Time:** Socket.io 4.7
- **Database:** MySQL 8.0
- **Frontend:** HTML5, CSS3, Bootstrap 5, JavaScript, EJS 3.1
- **Security:** bcryptjs 2.4, express-session 1.18
- **Utilities:** uuid 10.0, mysql2 3.11

---

## System Requirements

- Node.js v18 or higher
- MySQL 8.0 (via XAMPP or standalone installation)
- A modern web browser (Chrome, Firefox, Edge)

---

## Installation and Setup

Step 1 - Clone the repository:
git clone https://github.com/Drima17/smartqueue.git
cd smartqueue

Step 2 - Install dependencies:
npm install

Step 3 - Set up the database:
Start MySQL via XAMPP, open phpMyAdmin, create a database named
smartqueue_dbmm, then import the setup.sql file included in this repository.

Step 4 - Configure database connection:
Open config/db.js and confirm host is localhost, user is root,
password is empty, and database is smartqueue_dbmm.

Step 5 - Start the server:
npm start

Step 6 - Open in browser:
Login page: http://localhost:3000/login
Waiting room display: http://localhost:3000/display

## Default Login Credentials

Administrator - username: admin, password: password123
Receptionist - username: reception1, password: password123
Doctor (General Outpatient) - username: doctor1, password: password123
Doctor (Paediatrics) - username: doctor2, password: password123


## System Interfaces

| URL | Interface | Access |
|-----|-----------|--------|
| `/login` | Staff login page | Public |
| `/receptionist` | Patient registration and queue management | Receptionist, Admin |
| `/doctor` | Call next patient and mark as seen | Doctor |
| `/admin` | System administration and statistics | Admin |
| `/track/:token` | Patient self-tracking page | Public (via token) |
| `/display` | Waiting room display board | Public |

---

## Project Structure

smartqueue/
├── app.js # Main server entry point
├── package.json # Dependencies and scripts
├── setup.sql # Database initialisation script
├── config/
│ └── db.js # MySQL connection pool
├── middleware/
│ └── auth.js # Authentication and role middleware
├── routes/
│ ├── auth.js # Login and logout
│ ├── receptionist.js # Patient registration and queue management
│ ├── doctor.js # Call next and mark as seen
│ ├── admin.js # Department and user management
│ └── patient.js # Patient tracking and display
├── views/
│ ├── login.ejs # Login page
│ ├── receptionist.ejs # Receptionist dashboard
│ ├── doctor.ejs # Doctor dashboard
│ ├── admin.ejs # Admin dashboard
│ ├── track.ejs # Patient self-tracking page
│ ├── display.ejs # Waiting room display board
│ └── error.ejs # Error page
└── public/
├── css/style.css # Global design system
└── js/socket-client.js # Client-side WebSocket handler


---

## Dependency Versions

```json
{
  "bcryptjs": "^2.4.3",
  "connect-flash": "^0.1.1",
  "ejs": "^3.1.10",
  "express": "^4.19.2",
  "express-session": "^1.18.0",
  "mysql2": "^3.11.0",
  "socket.io": "^4.7.5",
  "uuid": "^10.0.0"
}
```

---

## Licence

This project was developed as an academic final-year project at Delta State 
University, Abraka, Nigeria. It is submitted for educational purposes.


## Submitted Version

Tag: v1.0.0 - This tag corresponds to the exact version submitted
with the final year project report.