const express = require('express');
const { createServer } = require('http');
const { execute, subscribe } = require('graphql');
const { fileLoader, mergeTypes, mergeResolvers } = require('merge-graphql-schemas');
const { SubscriptionServer } = require('subscriptions-transport-ws');
const bodyParser = require('body-parser');
const path = require('path');
const { makeExecutableSchema } = require('graphql-tools');
const graphqlHTTP = require('express-graphql');
const cors = require('cors');
const fs = require('fs');
const multer = require('multer');

// const { createServer } = require('https');

const auth = require('./middleware/auth');

const sequelize = require('./util/db');
const Game = require('./models/game');
const User = require('./models/user');
const Player = require('./models/player');
const Message = require('./models/message');
const Conversation = require('./models/conversation');
const Participant = require('./models/participant');

const typeDefs = mergeTypes(fileLoader(path.join(__dirname, './schema')));
const resolvers = mergeResolvers(fileLoader(path.join(__dirname, './resolvers')));

const schema = makeExecutableSchema({
  typeDefs,
  resolvers
});

const app = express();

app.use(cors());

const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'images/' + req.userId);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const fileFilter = (req, file, cb) => {
  if (
    file.mimetype === 'image/png' ||
    file.mimetype === 'image/jpg' ||
    file.mimetype === 'image/jpeg'
  ) {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

const upload = multer({ storage: fileStorage, fileFilter: fileFilter }).array('file');

app.use('/images', express.static(path.join(__dirname, 'images')));

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'OPTIONS, GET, POST, PUT, PATCH, DELETE'
    );
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }

    next();
});

// Set authorization context before performing resolver commands 
app.use(auth);

app.post('/post-image', (req, res) => {
  if (!req.isAuth) {
    throw new Error('Not authenticated!');
  }

  if (req.query.user != req.userId) {
    throw new Error('Unauthorized user');
  }

  let dir =  __dirname + '/images/' + req.userId;

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  } 
  
  upload(req, res, (err) => {
    if (err) {
      return res.status(500).json(err)
    }
    return res.status(200).send(req.body)
  })
});

app.use(
  '/graphql',
  bodyParser.json(),
  graphqlHTTP(req => {
    return {
      schema: schema,
      graphiql: true,
      context: {
        user: req.userId,
        userName: req.userName,
        userPic: req.userPic,
        isAuth: req.isAuth
      },
      customFormatErrorFn: error => ({
        message: error.message || 'An error occurred.',
        code: error.originalError.code || 500,
        data: error.originalError.data
      })
    } 
  }),
);


User.belongsToMany(Game, { through: Player, constraints: true, onDelete: 'CASCADE' });
User.belongsToMany(Conversation, { through: Participant, constraints: true, onDelete: 'CASCADE' });
Game.belongsToMany(User, { through: Player, constraints: true, onDelete: 'CASCADE' });

Game.hasMany(Player);
Player.belongsTo(Game);

Conversation.belongsToMany(User, { through: Participant, constraints: true, onDelete: 'CASCADE' });
Conversation.hasOne(Game, { constraints: true, onDelete: 'CASCADE' });
Conversation.hasMany(Message, { constraints: true, onDelete: 'CASCADE' });
Message.belongsTo(User, { constraints: true });
Message.belongsTo(Game, { constraints: true });
Message.belongsTo(Conversation, { constraints: true, onUpdate: 'CASCADE' });

const server = createServer(app);

sequelize
  // .sync({ force: true })
  .sync()
  .then( () => {
    server.listen(8080, () => {
      console.log('Server online!')
      new SubscriptionServer (
        {
          execute,
          subscribe,
          schema
        },
        {
          server,
          path: '/subscriptions'
        }
      );
    })
  })
  .catch(err => {
    console.log(err);
  });