const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcryptjs');
const path = require('path');
const flash = require('connect-flash');
const mysql = require('mysql2/promise');
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const morgan = require('morgan');
const fs = require('fs');
const { exec } = require('child_process');

require('dotenv').config();

// Initialize Express App
const app = express();

// Use morgan for logging
app.use(morgan('tiny'));

// MySQL connection pool setup
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

function backupDatabase() {
    const backupDir = path.join(__dirname, 'sql');
    const backupFile = path.join(backupDir, `backup_${new Date().toISOString().split('T')[0]}.sql`);

    // Ensure the backup directory exists
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
    }

    const dumpCommand = `mysqldump -u${process.env.DB_USER} -p${process.env.DB_PASSWORD} ${process.env.DB_NAME} > ${backupFile}`;

    exec(dumpCommand, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing mysqldump: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`mysqldump stderr: ${stderr}`);
            return;
        }
        console.log(`Database backup created successfully: ${backupFile}`);
    });
}

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: false
}));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());

// Set EJS as the template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Passport Config for Local Strategy
passport.use(new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
  },
    async (email, password, done) => {
      try {
        const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length > 0) {
          const user = rows[0];
          const isMatch = await bcrypt.compare(password, user.password);
          if (isMatch) {
            return done(null, user);
          } else {
            return done(null, false, { message: 'Incorrect password.' });
          }
        } else {
          return done(null, false, { message: 'Email not registered.' });
        }
        backupDatabase();   // Backup the database after each local authentication
      } catch (err) {
        return done(err);
      }
    }
));

// Configure the Google strategy for use by Passport.
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback'
  },
    async (token, tokenSecret, profile, done) => {
      try {
        // Check if the user already exists by Google ID
        let [rows] = await db.query('SELECT * FROM users WHERE google_id = ?', [profile.id]);

        if (rows.length > 0) {
          // User exists, log them in
          return done(null, rows[0]);
        } else {
          // Check if the user already exists by email
          [rows] = await db.query('SELECT * FROM users WHERE email = ?', [profile.emails[0].value]);
          if (rows.length > 0) {
            // User exists, update their Google ID and log them in
            const user = rows[0];
            await db.query('UPDATE users SET google_id = ? WHERE id = ?', [profile.id, user.id]);
            return done(null, user);
          } else {
            // User does not exist, create a new user
            const newUser = {
              email: profile.emails[0].value,
              name: profile.displayName,
              google_id: profile.id
            };

            const [result] = await db.query('INSERT INTO users (email, name, google_id) VALUES (?, ?, ?)',
              [newUser.email, newUser.name, newUser.google_id]);

            newUser.id = result.insertId;
            return done(null, newUser);
          }
        }
        backupDatabase(); // Backup the database after each Google authentication
      } catch (err) {
        return done(err);
      }
    }
));

// Serialize user into the sessions
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Deserialize user from the sessions
passport.deserializeUser(async (id, done) => {
    try {
      const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
      done(null, rows[0]);
      backupDatabase(); // Backup the database after each deserialization
    } catch (err) {
      done(err);
    }
});

// Nodemailer configuration
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
    }
});

// Middleware for Role-Based Access Control
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

function ensureAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'admin') {
        return next();
    }
    res.redirect('/login');
}

function ensureManager(req, res, next) {
    if (req.isAuthenticated() && (req.user.role === 'admin' || req.user.role === 'manager')) {
        return next();
    }
    res.redirect('/login');
}

// Routes
app.get('/', async (req, res) => {
    try {
        const [results] = await db.query(`
            SELECT events.*, organizations.name AS organization_name, locations.name AS location_name
            FROM events
            JOIN organizations ON events.organization_id = organizations.id
            JOIN locations ON events.location_id = locations.id
            WHERE events.approved = TRUE
        `);
        res.render('index', { events: results, user: req.user });
        backupDatabase(); // Backup the database after each request
    } catch (err) {
        console.error('Database Error:', err);
        req.flash('error', 'There was an error retrieving the events.');
        res.redirect('/');
    }
});

app.get('/login', (req, res) => {
    res.render('login', { messages: req.flash(), user: req.user });
});

app.get('/signup', (req, res) => {
    res.render('signup', { messages: req.flash(), user: req.user });
});

app.get('/forgot_password', (req, res) => {
    res.render('forgot_password', { messages: req.flash(), user: req.user });
});

app.get('/dashboard', ensureAuthenticated, async (req, res) => {
    const userId = req.user.id;

    try {
        const [userResults] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
        const [userEvents] = await db.query('SELECT * FROM events WHERE user_id = ?', [userId]);
        const [rsvpEvents] = await db.query(`
            SELECT events.*, organizations.name as organization_name, locations.name as location_name
            FROM events
            JOIN rsvps ON events.id = rsvps.event_id
            JOIN organizations ON events.organization_id = organizations.id
            JOIN locations ON events.location_id = locations.id
            WHERE rsvps.user_id = ?
        `, [userId]);

        res.render('dashboard', {
            user: userResults[0],
            events: userEvents,
            rsvpEvents: rsvpEvents,
            messages: req.flash(),
        });
        backupDatabase(); // Backup the database after each request
    } catch (err) {
        console.error('Database Error:', err);
        req.flash('error', 'There was an error retrieving your information.');
        res.redirect('/');
    }
});

app.get('/about', (req, res) => {
    res.render('about', { user: req.user });
});

app.get('/notification', ensureAuthenticated, async (req, res) => {
    if (req.user.role !== 'organization') {
        req.flash('error', 'You do not have permission to access this page.');
        return res.redirect('/dashboard');
    }

    try {
        const [events] = await db.query(`
            SELECT events.*, locations.name AS location_name
            FROM events
            JOIN locations ON events.location_id = locations.id
            WHERE events.user_id = ?
        `, [req.user.id]);

        console.log('Fetched events:', events);  // Debugging line to ensure events are fetched
        res.render('notification', { user: req.user, events: events, messages: req.flash() });
        backupDatabase(); // Backup the database after each request
    } catch (err) {
        console.error('Database Error:', err);
        req.flash('error', 'There was an error retrieving your events.');
        res.redirect('/dashboard');
    }
});

app.post('/notification', ensureAuthenticated, async (req, res) => {
    if (req.user.role !== 'organization') {
        req.flash('error', 'You do not have permission to perform this action.');
        return res.redirect('/dashboard');
    }

    const { eventId, subject, message } = req.body;

    try {
        const [rsvpResults] = await db.query(`
            SELECT users.email
            FROM rsvps
            JOIN users ON rsvps.user_id = users.id
            WHERE rsvps.event_id = ?
        `, [eventId]);

        const emails = rsvpResults.map(rsvp => rsvp.email);

        if (emails.length === 0) {
            req.flash('error', 'No users have RSVP\'d for this event.');
            return res.redirect('/notification');
        }

        const mailOptions = {
            from: process.env.GMAIL_USER,
            to: emails,
            subject: subject,
            text: message
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Email Error:', error);
                req.flash('error', 'There was an error sending the notification.');
                return res.redirect('/notification');
            }

            req.flash('success', 'Notification sent successfully.');
            res.redirect('/notification');
        });
        backupDatabase(); // Backup the database after each request
    } catch (err) {
        console.error('Database Error:', err);
        req.flash('error', 'There was an error sending the notification.');
        res.redirect('/notification');
    }
});

app.get('/events', async (req, res) => {
    try {
        const [results] = await db.query(`
            SELECT events.*, organizations.name as organization_name, locations.name as location_name
            FROM events
            JOIN organizations ON events.organization_id = organizations.id
            JOIN locations ON events.location_id = locations.id
            WHERE events.approved = TRUE
        `);
        res.render('events', { events: results, user: req.user });
        backupDatabase(); // Backup the database after each request
    } catch (err) {
        console.error('Database Error:', err);
        req.flash('error', 'There was an error retrieving the events.');
        res.redirect('/');
    }
});

app.get('/post_event', (req, res, next) => {
    if (!req.isAuthenticated()) {
        req.session.returnTo = '/post_event';
        return res.redirect('/signup');
    }
    next();
}, (req, res) => {
    res.render('post_event', { user: req.user });
});

app.get('/faqs', (req, res) => {
    res.render('faqs', { user: req.user });
});

// Google OAuth Routes
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }),
    async (req, res) => {
        if (req.user) {
            const redirectTo = req.session.returnTo || '/dashboard';
            delete req.session.returnTo;

            console.log('Redirecting to:', redirectTo);
            console.log('Current User Role:', req.user.role);

            if (redirectTo === '/post_event' && req.user.role !== 'organization') {
                try {
                    console.log('Assigning organization role to user:', req.user.id);
                    await db.query('UPDATE users SET role = ? WHERE id = ?', ['organization', req.user.id]);
                    req.user.role = 'organization';
                    req.flash('success', 'Role updated to organization.');
                    console.log('Role updated successfully.');
                    backupDatabase(); // Backup the database after each Google authentication
                } catch (err) {
                    console.error('Database Error:', err);
                    req.flash('error', 'There was an error updating your role.');
                }
            }

            if (req.user.role === 'admin') {
                res.redirect('/admin');
            } else {
                res.redirect(redirectTo);
            }
        } else {
            res.redirect('/dashboard');
        }
    }
);


app.post('/login', [
    body('email').isEmail().withMessage('Enter a valid email').normalizeEmail(),
    body('password').notEmpty().withMessage('Password cannot be empty'),
], (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error', errors.array().map(err => err.msg).join(' '));
        return res.redirect('/login');
    }

    passport.authenticate('local', (err, user, info) => {
        if (err) {
            return next(err);
        }
        if (!user) {
            req.flash('error', 'Invalid email or password');
            return res.redirect('/login');
        }
        req.logIn(user, (err) => {
            if (err) {
                return next(err);
            }
            const redirectTo = req.session.returnTo || '/dashboard';
            delete req.session.returnTo;
            if (redirectTo === '/post_event' && user.role !== 'organization') {
                db.query('UPDATE users SET role = ? WHERE id = ?', ['organization', user.id])
                    .then(() => {
                        req.user.role = 'organization';
                        return res.redirect(redirectTo);
                        backupDatabase(); // Backup the database after each login
                    })
                    .catch((err) => {
                        console.error('Database Error:', err);
                        req.flash('error', 'There was an error updating your role.');
                        return res.redirect('/dashboard');
                    });
            } else {
                return res.redirect(redirectTo);
            }
        });
    })(req, res, next);
});

app.post('/signup', async (req, res) => {
    const { email, password, name, role } = req.body;
    const userRole = role === 'organization' ? 'organization' : 'user';

    try {
        // Check if email already exists
        const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length > 0) {
            req.flash('error', 'Email already registered.');
            return res.redirect('/signup');
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user into the database
        await db.query('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)', [email, hashedPassword, name, userRole]);

        req.flash('success', 'You have successfully signed up. Please log in.');
        res.redirect('/login');
        backupDatabase();  // Backup the database after each signup
    } catch (err) {
        console.error(err);
        req.flash('error', 'Something went wrong. Please try again.');
        res.redirect('/signup');
    }
});

app.post('/events', ensureAuthenticated, [
    body('name').notEmpty().withMessage('Event name is required'),
    body('organization').notEmpty().withMessage('Organization name is required'),
    body('location').notEmpty().withMessage('Location is required'),
    body('time').notEmpty().withMessage('Time is required'),
    body('description').notEmpty().withMessage('Description is required'),
    body('date').isISO8601().withMessage('Date must be a valid date')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error', errors.array().map(err => err.msg).join(' '));
        return res.redirect('/post_event');
    }

    const { name, organization, location, time, description, date } = req.body;

    try {
        let [orgResults] = await db.query('SELECT id FROM organizations WHERE name = ?', [organization]);
        let organizationId;
        if (orgResults.length) {
            organizationId = orgResults[0].id;
        } else {
            let [orgInsertResults] = await db.query('INSERT INTO organizations (name) VALUES (?)', [organization]);
            organizationId = orgInsertResults.insertId;
        }

        let [locResults] = await db.query('SELECT id FROM locations WHERE name = ?', [location]);
        let locationId;
        if (locResults.length) {
            locationId = locResults[0].id;
        } else {
            let [locInsertResults] = await db.query('INSERT INTO locations (name) VALUES (?)', [location]);
            locationId = locInsertResults.insertId;
        }

        await db.query('INSERT INTO events (name, organization_id, location_id, time, description, date, user_id, approved) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [name, organizationId, locationId, time, description, date, req.user.id, false]);

        req.flash('success', 'Event posted successfully! Awaiting admin approval.');
        res.redirect('/events');
        backupDatabase(); // Backup the database after each event post
    } catch (err) {
        console.error('Database Error:', err);
        req.flash('error', 'There was an error posting the event.');
        res.redirect('/post_event');
    }
});


app.post('/rsvp', ensureAuthenticated, [
    body('eventId').notEmpty().withMessage('Event ID is required')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error', errors.array().map(err => err.msg).join(' '));
        return res.redirect('/');
    }

    const { eventId } = req.body;
    try {
        await db.query('INSERT INTO rsvps (user_id, event_id) VALUES (?, ?)', [req.user.id, eventId]);

        const [eventResults] = await db.query('SELECT * FROM events WHERE id = ?', [eventId]);
        const event = eventResults[0];
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: req.user.email,
            subject: 'RSVP Confirmation',
            text: `You have successfully RSVP'd to ${event.name} happening at ${event.location_name} on ${event.date} at ${event.time}.`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Email Error:', error);
                req.flash('error', 'There was an error sending your RSVP confirmation.');
                return res.redirect('/');
            }

            req.flash('success', 'RSVP successful! A confirmation email has been sent.');
            res.redirect('/');
        });
        backupDatabase(); // Backup the database after each RSVP
    } catch (err) {
        console.error('Database Error:', err);
        req.flash('error', 'There was an error processing your RSVP.');
        res.redirect('/');
    }
});

app.post('/subscribe', [
    body('email').isEmail().withMessage('Enter a valid email').normalizeEmail()
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error', errors.array().map(err => err.msg).join(' '));
        return res.redirect('/');
    }

    const { email } = req.body;
    const mailOptions = {
        from: process.env.GMAIL_USER,
        to: email,
        subject: 'Subscription Confirmation',
        text: 'Thank you for subscribing to CauseConnect notifications.'
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Email Error:', error);
            req.flash('error', 'There was an error sending the subscription confirmation email.');
            return res.redirect('/');
        }

        req.flash('success', 'Subscription successful! A confirmation email has been sent.');
        res.redirect('/');
    });
});

app.get('/profile', ensureAuthenticated, (req, res) => {
    res.render('profile', { user: req.user, messages: req.flash() });
});

app.post('/profile', ensureAuthenticated, [
    body('email').isEmail().withMessage('Enter a valid email').normalizeEmail(),
    body('name').notEmpty().withMessage('Name cannot be empty'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error', errors.array().map(err => err.msg).join(' '));
        return res.redirect('/profile');
    }

    const { email, name } = req.body;
    try {
        await db.query('UPDATE users SET email = ?, name = ? WHERE id = ?', [email, name, req.user.id]);
        req.flash('success', 'Profile updated successfully!');
        res.redirect('/profile');
        backupDatabase(); // Backup the database after each profile update
    } catch (err) {
        console.error('Database Error:', err);
        req.flash('error', 'There was an error updating your profile.');
        res.redirect('/profile');
    }
});

app.get('/admin', ensureAdmin, async (req, res) => {
    try {
        const [users] = await db.query('SELECT * FROM users');
        const [pendingEvents] = await db.query(`
            SELECT events.*, organizations.name AS organization_name, locations.name AS location_name
            FROM events
            JOIN organizations ON events.organization_id = organizations.id
            JOIN locations ON events.location_id = locations.id
            WHERE events.approved = FALSE
        `);
        const [approvedEvents] = await db.query(`
            SELECT events.*, organizations.name AS organization_name, locations.name AS location_name
            FROM events
            JOIN organizations ON events.organization_id = organizations.id
            JOIN locations ON events.location_id = locations.id
            WHERE events.approved = TRUE
        `);
        res.render('admin', {
            users: users,
            pendingEvents: pendingEvents,
            approvedEvents: approvedEvents,
            user: req.user,
            messages: req.flash()
        });
        backupDatabase(); // Backup the database after each request
    } catch (err) {
        console.error('Database Error:', err);
        req.flash('error', 'There was an error retrieving the data.');
        res.redirect('/dashboard');
    }
});

app.post('/approve_event', ensureAdmin, [
    body('eventId').notEmpty().withMessage('Event ID is required')
], async (req, res) => {
    const { eventId } = req.body;
    try {
        await db.query('UPDATE events SET approved = TRUE WHERE id = ?', [eventId]);
        req.flash('success', 'Event approved successfully!');
        res.redirect('/admin');
        backupDatabase(); // Backup the database after each event approval
    } catch (err) {
        console.error('Database Error:', err);
        req.flash('error', 'There was an error approving the event.');
        res.redirect('/admin');
    }
});

app.post('/delete_event', ensureAdmin, [
    body('eventId').notEmpty().withMessage('Event ID is required')
], async (req, res) => {
    const { eventId } = req.body;
    try {
        await db.query('DELETE FROM events WHERE id = ?', [eventId]);
        req.flash('success', 'Event deleted successfully!');
        res.redirect('/admin');
        backupDatabase(); // Backup the database after each event deletion
    } catch (err) {
        console.error('Database Error:', err);
        req.flash('error', 'There was an error deleting the event.');
        res.redirect('/admin');
    }
});

app.get('/manage', ensureManager, async (req, res) => {
    try {
        const [events] = await db.query('SELECT * FROM events WHERE user_id = ?', [req.user.id]);
        res.render('manage', { events: events });
        backupDatabase(); // Backup the database after each request
    } catch (err) {
        console.error('Database Error:', err);
        req.flash('error', 'There was an error retrieving the events.');
        res.redirect('/dashboard');
    }
});

app.get('/logout', (req, res) => {
    req.logout(err => {
        if (err) {
            console.error('Logout Error:', err);
            req.flash('error', 'There was an error logging out.');
            return res.redirect('/dashboard');
        }
        req.flash('success', 'You have successfully logged out.');
        res.redirect('/');
    });
});

app.get('/forgot_password', (req, res) => {
    res.render('forgot_password', { messages: req.flash() });
});

app.post('/forgot_password', [
    body('email').isEmail().withMessage('Enter a valid email').normalizeEmail()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error', errors.array().map(err => err.msg).join(' '));
        return res.redirect('/forgot_password');
    }

    const { email } = req.body;
    const newPassword = 'Pass@123';
    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    try {
        const [results] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (!results.length) {
            req.flash('error', 'No account found with that email address.');
            return res.redirect('/forgot_password');
        }

        await db.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);

        const mailOptions = {
            from: process.env.GMAIL_USER,
            to: email,
            subject: 'Password Reset',
            text: `Your password has been reset to '${newPassword}'. Please log in and change your password.`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Email Error:', error);
                req.flash('error', 'There was an error sending the password reset email.');
                return res.redirect('/forgot_password');
            }

            req.flash('success', 'Your password has been reset and sent to your email.');
            res.redirect('/login');
        });
        backupDatabase(); // Backup the database after each password reset
    } catch (err) {
        console.error('Database Error:', err);
        req.flash('error', 'There was an error resetting your password.');
        res.redirect('/forgot_password');
    }
});

app.listen(8080, () => {
    console.log('Server running on http://localhost:8080');
});

app.use(express.static(path.join(__dirname, 'public')));

app.post('/update_role', ensureAdmin, [
    body('userId').notEmpty().withMessage('User ID is required'),
    body('role').notEmpty().withMessage('Role is required')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error', errors.array().map(err => err.msg).join(' '));
        return res.redirect('/admin');
    }

    const { userId, role } = req.body;
    try {
        await db.query('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
        req.flash('success', 'User role updated successfully!');
        res.redirect('/admin');
        backupDatabase(); // Backup the database after each role update
    } catch (err) {
        console.error('Database Error:', err);
        req.flash('error', 'There was an error updating the user role.');
        res.redirect('/admin');
    }
});

app.post('/delete_user', ensureAdmin, [
    body('userId').notEmpty().withMessage('User ID is required')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error', errors.array().map(err => err.msg).join(' '));
        return res.redirect('/admin');
    }

    const { userId } = req.body;

    try {
        await db.query('DELETE FROM events WHERE user_id = ?', [userId]);
        await db.query('DELETE FROM users WHERE id = ?', [userId]);
        req.flash('success', 'User deleted successfully!');
        res.redirect('/admin');
        backupDatabase(); // Backup the database after each user deletion
    } catch (err) {
        console.error('Database Error:', err);
        req.flash('error', 'There was an error deleting the user.');
        res.redirect('/admin');
    }
});
