const Sequelize = require('sequelize');

const sequelize = require('../util/db');

const User = sequelize.define('user', {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    allowNull: false,
    primaryKey: true
  },
  name: {
    type: Sequelize.STRING,
    allowNull: false
  },
  phoneNumber: {
    type: Sequelize.STRING
  },
  password: {
    type: Sequelize.STRING,
  },
  age: {
    type: Sequelize.INTEGER,   
    allowNull: false
  },
  gender: {
    type: Sequelize.STRING,   
    allowNull: false
  },
  status : {
      type: Sequelize.STRING,
      defaultValue: "Let's Play!"
  }
});

module.exports = User;