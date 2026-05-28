require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');

function getSleepStatus(hours) {
    if (hours >= 7 && hours <= 9) return "Ottimo";
    else if (hours >= 6 && hours < 7) return "Buono";
    else if (hours >= 5 && hours < 6) return "Scarso";
    return "Molto scarso";
}

const User = require('./models/User');
const Sleep = require('./models/Sleep');

const app = express();

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('MongoDB connesso'))
.catch(err => console.log(err));

app.set('view engine', 'ejs');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

app.use(cookieParser());

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

function isAuthenticated(req, res, next) {
    if(req.session.userId) {
        return next();
    }
    res.redirect('/login');
}

app.get('/', (req, res) => {
    res.redirect('/login');
});

app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', async (req, res) => {

    const { username, password } = req.body;

    try {

        // 1. controllo username
        const existingUser = await User.findOne({ username });

        if (existingUser) {
            return res.status(400).render('register', {
                error: "Username già utilizzato"
            });
        }

        // 2. controllo password (REGEX)
        const passwordRegex = /^(?=.*[A-Z]).{8,}$/;

        if (!passwordRegex.test(password)) {
            return res.status(400).render('register', {
                error: "Password non valida: minimo 8 caratteri e almeno una maiuscola"
            });
        }

        // 3. SOLO SE TUTTO OK → salva
        const hashedPassword = await bcrypt.hash(password, 10);

        await User.create({
            username,
            password: hashedPassword
        });

        return res.redirect('/login');

    } catch (err) {
        console.log(err);
        return res.status(500).render('register', {
            error: "Errore del server"
        });
    }
});

app.get('/login', (req, res) => {
    res.render('login');
});


app.post('/login', async (req, res) => {
    try {
        console.log("BODY:", req.body);

        const { username, password } = req.body;

        if (!username || !password) {
            return res.send("Username o password mancanti");
        }

        const user = await User.findOne({ username });

        if (!user) {
            return res.send("Utente non trovato");
        }

        if (!user.password) {
            return res.send("Password mancante nel DB");
        }

        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.send("Password errata");
        }

        req.session.userId = user._id;

        res.redirect('/dashboard');

    } catch (err) {
        console.log("LOGIN ERROR:", err);
        res.status(500).send("Errore server login");
    }
});

app.get('/dashboard', isAuthenticated, async (req, res) => {

    const sleepData = await Sleep.find({
        userId: req.session.userId
    }).sort({ date: -1 });

    const listSleep = await Sleep.find({
        userId: req.session.userId
    }).sort({ date: -1 }).limit(7);

    const chartData = {
        labels: listSleep.map(d => d.date.toLocaleDateString()).reverse(),
        values: listSleep.map(d => d.hours).reverse()
    };

    const error = req.session.error;
    req.session.error = null;

    res.render('dashboard', {
        sleepData,
        chartData,
        error
    });
});


app.get('/info', isAuthenticated, (req, res) => {
    res.render('info');
});

app.get('/soluzioni', isAuthenticated, (req, res) => {
    res.render('soluzioni');
});

app.post('/sleep', isAuthenticated, async (req, res) => {

    try {

        let { hours, date } = req.body;

        const hoursNumber = Number(hours);

        if (!Number.isFinite(hoursNumber)) {
            req.session.error = "Le ore devono essere un numero valido";
            return res.redirect('/dashboard');
        }


        if (hoursNumber < 0 || hoursNumber > 24) {
            req.session.error = "Le ore devono essere tra 0 e 24";
            return res.redirect('/dashboard');
        }


        const dateObj = new Date(date);

        if (!date || isNaN(dateObj.getTime())) {
            req.session.error = "Data non valida (usa formato YYYY-MM-DD)";
            return res.redirect('/dashboard');
        }

        const quality = getSleepStatus(hoursNumber);

        await Sleep.create({
            userId: req.session.userId,
            hours: hoursNumber,
            quality,
            date: dateObj
        });

        res.redirect('/dashboard');

    } catch (err) {
        console.log(err);
        req.session.error = "Errore server";
        res.redirect('/dashboard');
    }
});


// GET tutti i dati sonno (JSON)
app.get('/api/sleep', isAuthenticated, async (req, res) => {

    try {

        const sleepData = await Sleep.find({
            userId: req.session.userId
        }).sort({ date: -1 });

        res.json(sleepData);

    } catch (err) {

        res.status(500).json({ error: 'Errore server' });

    }
});


app.post('/api/sleep', isAuthenticated, async (req, res) => {

    try {

        const { hours, date } = req.body;

        const quality = getSleepStatus(hours);

        const sleep = new Sleep({
            userId: req.session.userId,
            hours,
            quality,
            date
        });

        await sleep.save();

        res.json({
            message: 'Dati salvati',
            sleep
        });

    } catch (err) {

        res.status(500).json({ error: 'Errore server' });

    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.listen(process.env.PORT || 3000, () => {
    console.log(`Server avviato su http://localhost:${process.env.PORT || 3000}`);
});