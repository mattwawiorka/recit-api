const express = require('express');
const graphqlHttp = require('express-graphql');
const { buildSchema } = require('graphql');
const { fileLoader, mergeTypes, mergeResolvers } = require('merge-graphql-schemas');
const bodyParser = require('body-parser');
const path = require('path');

const auth = require('./middleware/auth');

const sequelize = require('./util/db');
const Game = require('./models/game');
const User = require('./models/user');
const GamePlayer = require('./models/game-player');

const schema = mergeTypes(fileLoader(path.join(__dirname, './schema')));
const resolvers = mergeResolvers(fileLoader(path.join(__dirname, './resolvers')));

const app = express();

app.use(bodyParser.json());

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

app.use(auth);

app.use(
  '/graphql',
  graphqlHttp({
    schema: buildSchema(schema),
    rootValue: resolvers,
    graphiql: true
  })
);

Game.belongsToMany(User, { through: GamePlayer });
User.belongsToMany(Game, { through: GamePlayer });

sequelize
  // .sync({ force: true })
  .sync()
  .then( () => {
    app.listen(8080);
  })
  .catch(err => {
    console.log(err);
  });