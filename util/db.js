const Sequelize = require('sequelize').Sequelize;

const db = require('../db.json');

const sequelize = new Sequelize(db.database, db.user, db.password, {
  dialect: 'mysql',
  host: 'localhost',
  port: '3306',
  logging: true,
});

sequelize.query("SET GLOBAL sql_mode = ''", { raw: true });

module.exports = sequelize;