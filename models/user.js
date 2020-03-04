const fs = require('fs');
const path = require('path');

const Sequelize = require('sequelize');
const sequelize = require('../util/db');

const debug = require('debug')('images');

const User = sequelize.define('user', 
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    name: {
      type: Sequelize.STRING
    },
    // "Jersey Number" used to differentiate users with the same name
    // Could also be used in the future to generate default profile pic
    number: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 00
    },
    facebookId: {
      type: Sequelize.STRING
    },
    phoneNumber: {
      type: Sequelize.STRING
    },
    phoneCode: {
      type: Sequelize.INTEGER
    },
    verified: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
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
    },
    pic1: {
      type: Sequelize.STRING,
    },
    pic2: {
      type: Sequelize.STRING,
    },
    pic3: {
      type: Sequelize.STRING,
    },
    loginLocation: {
      type: Sequelize.GEOMETRY('POINT', 4326),
    },
    city: {
      type: Sequelize.STRING
    }
  },
  {
    hooks: {
      // After updating pics, remove old ones from the server
      afterUpdate: (user) => {
        // If pic is changed check if that pic is used elsewhere, if not - delete all copies
        let dir = path.join(__dirname, '../images/' + user.id + '/');
        if (user.changed('profilePic') && user.previous('profilePic') !== undefined) {
          if (Object.values(user.dataValues).indexOf(user.previous('profilePic')) < 0) {
            fs.unlink(dir + user.previous('profilePic').split('/' + user.id + '/')[1].split('.')[0] + '_THUMB.' + user.previous('profilePic').split('.')[1], error => debug(error));
            fs.unlink(dir + user.previous('profilePic').split('/' + user.id + '/')[1].split('.')[0] + '_SMALL.' + user.previous('profilePic').split('.')[1], error => debug(error));
            fs.unlink(dir + user.previous('profilePic').split('/' + user.id + '/')[1].split('.')[0] + '_MEDIUM.' + user.previous('profilePic').split('.')[1], error => debug(error));
            fs.unlink(dir + user.previous('profilePic').split('/' + user.id + '/')[1].split('.')[0] + '_LARGE.' + user.previous('profilePic').split('.')[1], error => debug(error));
          }
        }
        if (user.changed('pic1') && user.previous('pic1') !== undefined) {
          if (Object.values(user.dataValues).indexOf(user.previous('pic1')) < 0) {
            fs.unlink(dir + user.previous('pic1').split('/' + user.id + '/')[1].split('.')[0] + '_SMALL.' + user.previous('pic1').split('.')[1], error => debug(error));
            fs.unlink(dir + user.previous('pic1').split('/' + user.id + '/')[1].split('.')[0] + '_LARGE.' + user.previous('pic1').split('.')[1], error => debug(error));
          }
        }
        if (user.changed('pic2') && user.previous('pic2') !== undefined) {
          if (Object.values(user.dataValues).indexOf(user.previous('pic2')) < 0) {
            fs.unlink(dir + user.previous('pic2').split('/' + user.id + '/')[1].split('.')[0] + '_SMALL.' + user.previous('pic2').split('.')[1], error => debug(error));
            fs.unlink(dir + user.previous('pic2').split('/' + user.id + '/')[1].split('.')[0] + '_LARGE.' + user.previous('pic2').split('.')[1], error => debug(error));
          }
        }
        if (user.changed('pic3') && user.previous('pic3') !== undefined) {
          if (Object.values(user.dataValues).indexOf(user.previous('pic3')) < 0) {
            fs.unlink(dir + user.previous('pic3').split('/' + user.id + '/')[1].split('.')[0] + '_SMALL.' + user.previous('pic3').split('.')[1], error => debug(error));
            fs.unlink(dir + user.previous('pic3').split('/' + user.id + '/')[1].split('.')[0] + '_LARGE.' + user.previous('pic3').split('.')[1], error => debug(error));
          }
        }
      }
    }
  }
);

module.exports = User;