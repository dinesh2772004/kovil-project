const express = require('express');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const multer = require('multer');

const app = express();
const port = process.env.PORT || 3000;
const DB_FILE = 'db.json';

// Multer Storage Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Ensure uploads folder exists
fs.ensureDirSync('public/uploads/');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: 'divine-secret-777',
    resave: false,
    saveUninitialized: true
}));

app.use(express.static('public'));
app.use('/images', express.static('images'));

// Auth middleware
const checkAuth = (req, res, next) => {
    if (req.session.authenticated) {
        next();
    } else {
        res.status(401).json({ success: false, message: 'Unauthorized' });
    }
};

// API Routes
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const db = await fs.readJson(DB_FILE);
    const user = db.admin.find(u => u.username === username && u.password === password);

    if (user) {
        req.session.authenticated = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

app.get('/api/check-auth', (req, res) => {
    res.json({ authenticated: !!req.session.authenticated });
});

app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin.html');
});

// Timings
app.get('/api/timings', async (req, res) => {
    const db = await fs.readJson(DB_FILE);
    res.json(db.timings);
});

app.post('/api/timings/update', checkAuth, async (req, res) => {
    const db = await fs.readJson(DB_FILE);
    db.timings = req.body;
    await fs.writeJson(DB_FILE, db, { spaces: 2 });
    res.json({ success: true });
});

// History
app.get('/api/history', async (req, res) => {
    const db = await fs.readJson(DB_FILE);
    res.json(db.history);
});

app.post('/api/history/update', checkAuth, async (req, res) => {
    const db = await fs.readJson(DB_FILE);
    db.history = req.body;
    await fs.writeJson(DB_FILE, db, { spaces: 2 });
    res.json({ success: true });
});

// Specialities
app.get('/api/specialities', async (req, res) => {
    const db = await fs.readJson(DB_FILE);
    res.json(db.specialities || []);
});

app.post('/api/specialities/update', checkAuth, async (req, res) => {
    const db = await fs.readJson(DB_FILE);
    db.specialities = req.body;
    await fs.writeJson(DB_FILE, db, { spaces: 2 });
    res.json({ success: true });
});

// Festivals
app.get('/api/festivals', async (req, res) => {
    const db = await fs.readJson(DB_FILE);
    res.json(db.festivals || []);
});

app.post('/api/festivals/add', checkAuth, upload.single('image'), async (req, res) => {
    const db = await fs.readJson(DB_FILE);
    const newFest = {
        id: Date.now(),
        title: req.body.title,
        date: req.body.date,
        description: req.body.description,
        image: req.file ? '/uploads/' + req.file.filename : 'images.jpg'
    };
    db.festivals.push(newFest);
    await fs.writeJson(DB_FILE, db, { spaces: 2 });
    res.json({ success: true, festival: newFest });
});

app.post('/api/festivals/edit/:id', checkAuth, upload.single('image'), async (req, res) => {
    const db = await fs.readJson(DB_FILE);
    const index = db.festivals.findIndex(f => f.id == req.params.id);
    if (index !== -1) {
        db.festivals[index].title = req.body.title;
        db.festivals[index].date = req.body.date;
        db.festivals[index].description = req.body.description;
        if (req.file) {
            if (db.festivals[index].image && db.festivals[index].image.startsWith('/uploads/')) {
                const oldPath = path.join(__dirname, 'public', db.festivals[index].image);
                if (await fs.pathExists(oldPath)) await fs.remove(oldPath);
            }
            db.festivals[index].image = '/uploads/' + req.file.filename;
        }
        await fs.writeJson(DB_FILE, db, { spaces: 2 });
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, message: 'Festival not found' });
    }
});

app.delete('/api/festivals/:id', checkAuth, async (req, res) => {
    try {
        const db = await fs.readJson(DB_FILE);
        const idToDelete = req.params.id;
        const fest = db.festivals.find(f => f.id == idToDelete);

        if (fest) {
            if (fest.image && fest.image.startsWith('/uploads/')) {
                const filePath = path.join(__dirname, 'public', fest.image);
                if (await fs.pathExists(filePath)) await fs.remove(filePath);
            }
            db.festivals = db.festivals.filter(f => f.id != idToDelete);
            await fs.writeJson(DB_FILE, db, { spaces: 2 });
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: 'Festival not found' });
        }
    } catch (err) {
        console.error('Delete error:', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Gallery (Images/Videos)
app.get('/api/gallery', async (req, res) => {
    const db = await fs.readJson(DB_FILE);
    res.json(db.gallery || []);
});

app.post('/api/gallery/upload', checkAuth, upload.single('file'), async (req, res) => {
    const db = await fs.readJson(DB_FILE);
    const newMedia = {
        id: Date.now(),
        type: req.file.mimetype.startsWith('image') ? 'image' : 'video',
        url: '/uploads/' + req.file.filename,
        caption: req.body.caption || ''
    };
    db.gallery.push(newMedia);
    await fs.writeJson(DB_FILE, db, { spaces: 2 });
    res.json({ success: true, media: newMedia });
});

app.post('/api/gallery/edit/:id', checkAuth, async (req, res) => {
    const db = await fs.readJson(DB_FILE);
    const index = db.gallery.findIndex(m => m.id == req.params.id);
    if (index !== -1) {
        db.gallery[index].caption = req.body.caption;
        await fs.writeJson(DB_FILE, db, { spaces: 2 });
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, message: 'Media not found' });
    }
});

app.delete('/api/gallery/:id', checkAuth, async (req, res) => {
    const db = await fs.readJson(DB_FILE);
    const media = db.gallery.find(m => m.id == req.params.id);
    if (media) {
        const filePath = path.join(__dirname, 'public', media.url);
        if (await fs.pathExists(filePath)) await fs.remove(filePath);
        db.gallery = db.gallery.filter(m => m.id != req.params.id);
        await fs.writeJson(DB_FILE, db, { spaces: 2 });
    }
    res.json({ success: true });
});

app.listen(port, () => {
    console.log(`Murugar Kovil website running at http://localhost:${port}`);
});
