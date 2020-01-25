const Sequelize = require('sequelize');

const sequelize = require('../util/db');

const User = sequelize.define('user', 
  {
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
    userName: {
      type: Sequelize.STRING
    },
    phoneNumber: {
      type: Sequelize.STRING
    },
    password: {
      type: Sequelize.STRING,
      allowNull: false
    },
    dob: {
      type: Sequelize.DATE  
    },
    gender: {
      type: Sequelize.STRING
    },
    status: {
      type: Sequelize.STRING,
      defaultValue: "Let's Play!"
    },
    profilePic: {
      type: Sequelize.STRING,
      defaultValue: 'profile-blank.png'
    },
    loginLocation: {
      type: Sequelize.GEOMETRY('POINT', 4326)
    },
    city: {
      type: Sequelize.STRING
    }
  }
);

module.exports = User;