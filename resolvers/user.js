const User = require('../models/user');
const jwt = require('jsonwebtoken');

const resolvers = {
    Query: {
        users: () => {
            return User.findAll()
            .then( users => {
                return users;
            }).catch(err => {
                console.log(err);
            });
        },
        user: (parent, args) => {
            return User.findOne({
                where: {
                    id: args.id
                }
            })
            .then( user => {
                return user;
            }).catch(err => {
                console.log(err);
            });
        },
    },
    Mutation: {
        createUser: (parent, args) => {
            return User.create({
                name: args.userInput.name,
                password: args.userInput.password,
                phoneNumber: args.userInput.phoneNumber, 
                age: args.userInput.age,
                gender: args.userInput.gender,
                status: args.userInput.status
            })
            .then( user => {
                return user;
            })
            .catch(err => {
                console.log(err);
            });
        },
        updateUser: (parent, args) => {
            return User.findOne({
                where: {
                    id: args.id
                }
            })
            .then( user => {
                return user.update({
                    name: args.userInput.name,
                    password: args.userInput.password,
                    age: args.userInput.age,
                    gender: args.userInput.gender,
                    status: args.userInput.status
                })
            })
            .then( result => {
                return result
            })
            .catch(err => {
                console.log(err);
            });
        },
        deleteUser: (parent, args) => {
            return User.destroy({
                where: {
                    id: args.id
                }
            })
            .then( rowsDeleted => {
                if (rowsDeleted === 1) {
                    return true;
                } else {
                    return false;
                }
            })
            .catch(err => {
                console.log(err);
            });
        },
        login: (parent, args) => {
            return User.findOne({
                where: {
                    name: args.name,
                    password: args.password
                }
            })
            .then( user => {
                const token = jwt.sign(
                    {
                        userId: user.id.toString()
                    }, 
                    'secret', 
                    { expiresIn: '24h' }
                );
                console.log('logged in')
                return { token: token, userId: user.id.toString() };
            }).catch(err => {
                console.log(err);
            });
        },
    }
};

module.exports = resolvers;