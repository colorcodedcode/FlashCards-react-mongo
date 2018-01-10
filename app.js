// Declarations
const express = require('express');
const app = express();
const myport = process.env.PORT || 3000;
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken')

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.listen(myport, () => console.log(`Now listening on port ${myport}`));

// Database Setup
const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/flashcardapp', { useMongoClient: true });
mongoose.connection.on('error', console.error.bind(console), 'MDB Connect Err')
mongoose.Promise = global.Promise;

const User = require('./models/user');
const Question = require('./models/question');

// Model Population
const Populate = require('./models/populate');
// Populate.setupUsers();
// Populate.setupQuestions();
// mongoose.connection.dropDatabase();

//Verification Middleware
function checkToken(req, res, next) {
    jwt.verify(req.headers.auth, 'uuddlrlrba13', (err, decoded) => {
        if (err) {
            res.sendStatus(403)
        } else {
            req.token = decoded;
            next()
        }
    })
}

//Routes
app.post('/login', (req, res) => {
    User.findOne({ email: req.body.email })
    .then(result => {
        if (req.body.email === result.email && req.body.password === result.password) {
            res.json({ 
                token: jwt.sign({ 
                    email: result.email, 
                    name: result.name, 
                    id: result._id }, 
                    'uuddlrlrba13', 
                    { expiresIn: 86400 }
                )
            })
        } else {
            res.send('error!')
        }
    })
});

// Verify route for initial mount of app
app.get('/verify', checkToken, (req, res) => {
    res.json({ status: 'verified'})
})

// Fetch route in app for retrieving randomised cards
app.get('/cards', checkToken, (req, res) => {
    User.findOne({ email: req.token.email })
    .select('stats')
    // calculate which cards user is good at (t1) and bad at (t2)
    .then(result => {
        result.stats.forEach(e => 
            e.timesCorrect/e.timesTested > 0.5 
            ? e.rate = 'tier1'
            : e.rate = 'tier2'
        )
        return result.stats;
    })
    // split tier results and rejoin random selection (40% good, 60% bad cards)
    .then(result => {
        let tier1 = result.filter(e => e.rate === 'tier1' )
        let tier2 = result.filter(e => e.rate === 'tier2' )
        return [
            ...Array.from({length: 12}, () => tier1[Math.floor(Math.random() * tier1.length)].identifier),
            ...Array.from({length: 18}, () => tier2[Math.floor(Math.random() * tier2.length)].identifier)
        ]
    })
    // shuffle results
    .then(result =>
        result.sort(() => (Math.random() - 0.5))
    )
    // find questions based on shuffled array
    .then(result => 
        Question.find().where('identifier').in(result)
    )
    .then(result => {
        res.json(result)
    })
});

// Fetch route in app for retrieving and posting user statistics
app.get('/stats', checkToken, (req, res) => {
    User.findOne({ email: req.token.email })
        .select('-password -email')
        .then(result => {
            result.timesCorrect = result.stats.reduce((a, i) => a + i.timesCorrect, 0)
            result.timesTested = result.stats.reduce((a, i) => a + i.timesTested, 0)
            result.level = Math.floor(result.timesCorrect * 10 / 250)
            return result
        })
        .then(result => res.json(result));
});
    
app.post('/stats', checkToken, (req, res) => {
    User.findOne({ email: req.token.email })
    .then(result => {

        let index = result.stats.findIndex(e => e.identifier === req.body.identifier )
        let record = result.stats[index]

        result.stats.set(index, {
            identifier: record.identifier,
            timesTested: record.timesTested +=1,
            timesCorrect: req.body.passed ? record.timesCorrect +=1 : record.timesCorrect
        })

        result.save(err => err ? err : null)
    })
    res.json('updated')
});
