const Sequelize = require('sequelize');

const sequelize = require('../util/db');

const Participant = require('./participant');

const Conversation = sequelize.define('conversation', 
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
  },
    { hooks: {
        afterSave: (c) => {
          Participant.findAll({ where: { conversationId: c.dataValues.id } })
          .then( result => {
            result.map( p => {
              p.changed('updatedAt', true);
              p.update({ updatedAt: Date.now() });
            })
          })
        }
      }
    }
);

module.exports = Conversation;