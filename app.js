const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const { createServer } = require('http');
const cors = require('cors');
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const { execute, subscribe } = require('graphql');
const { fileLoader, mergeTypes, mergeResolvers } = require('merge-graphql-schemas');
const { SubscriptionServer } = require('subscriptions-transport-ws');
const { makeExecutableSchema } = require('graphql-tools');
const graphqlHTTP = require('express-graphql');
const multer = require('multer');
const sharp = require('sharp');

// Setup Node environment
require('dotenv').config();

// Setup debugging
const debug_server = require('debug')('server');
const debug_images = require('debug')('images');

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

app.use(compression()); // Compress all routes

app.use(helmet());

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

const upload = multer({ storage: fileStorage, fileFilter: fileFilter }).single('file');
const upload_multi = multer({ storage: fileStorage, fileFilter: fileFilter }).array('file');

app.use('/images', express.static(path.join(__dirname, 'images')));

// app.use((req, res, next) => {
//     res.setHeader('Access-Control-Allow-Origin', '*');
//     res.setHeader(
//       'Access-Control-Allow-Methods',
//       'OPTIONS, GET, POST, PUT, PATCH, DELETE'
//     );
//     res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
//     if (req.method === 'OPTIONS') {
//       return res.sendStatus(200);
//     }

//     next();
// });

// Set authorization context before performing resolver commands 
app.use(auth);

// Post profile pic route
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

    // Create thumbnail, small, medium, and large copies of profile pic
    return sharp(req.file.path)
    .resize(48, 48)
    .toFile(req.file.path.split('.')[0] + '_THUMB.' + req.file.path.split('.')[1])
    .then(() => {
      return sharp(req.file.path)
      .resize(175, 175)
      .toFile(req.file.path.split('.')[0] + '_SMALL.' + req.file.path.split('.')[1])
      .then(() => {
        return sharp(req.file.path)
        .resize(350, 350)
        .toFile(req.file.path.split('.')[0] + '_MEDIUM.' + req.file.path.split('.')[1])
        .then(() => {
          return sharp(req.file.path)
          .resize(600, 600)
          .toFile(req.file.path.split('.')[0] + '_LARGE.' + req.file.path.split('.')[1])
          .then(() => {
            fs.unlink(req.file.path, error => debug_images(error)); 
            return res.status(200).send(req.body);
          })
        })
      })
    })
    .catch( error => {
      debug_images(error);
    })
  })
});

// Post other user pics route
app.post('/post-images', (req, res) => {
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
  
  upload_multi(req, res, (err) => {
    if (err) {
      return res.status(500).json(err)
    }
    return Promise.all(req.files.map( image => {
      // Create just small and large copies of all other pics
      return sharp(image.path)
      .resize(175, 175)
      .toFile(image.path.split('.')[0] + '_SMALL.' + image.path.split('.')[1])
      .then(() => {
        return sharp(image.path)
        .resize(600, 600)
        .toFile(image.path.split('.')[0] + '_LARGE.' + image.path.split('.')[1])
        .then(() => {
          fs.unlink(image.path, error => debug_images(error)); 
        })
      })
      .catch( error => {
        debug_images(error);
      })
    }))
    .then(() => {
      return res.status(200).send(req.body);
    })
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

User.belongsToMany(Game, { through: Player, constraints: false, onDelete: 'CASCADE' });
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

const server = createServer({
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.cert')
}, app);

sequelize
  // .sync({ force: true })
  .sync()
  .then( () => {
    server.listen(process.env.PORT, () => {
      console.log('Server listening on port ' + process.env.PORT)
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
  .catch( error => {
    debug_server(error);
  });