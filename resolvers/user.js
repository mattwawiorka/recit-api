const User = require('../models/user');
const jwt = require('jsonwebtoken');
const validator = require('validator');

const resolvers = {
    Query: {
        users: () => {
            return User.findAll()
            .then( users => {
                return users;
            }).catch(error => {
                throw error;
            });
        },
        user: (parent, args) => {
            return User.findOne({
                where: {
                    id: args.id
                }
            })
            .then( user => {
                return user.dataValues;
            }).catch(error => {
                throw error;
            });
        },
    },
    Mutation: {
        createUser: (parent, args) => {
            const { name, phoneNumber, password, age, gender } = args.userInput;
            const errors = [];
            const namePattern = /^[a-z0-9\s]+$/i;

            if (!name || !password || !phoneNumber || !age || !gender) {
                console.log('1')
                errors.push({ message: 'Please fill in all required fields' });
            }
            else if (!namePattern.test(name)) {
                console.log('2')
                errors.push({ message: 'Username an only contain letters and numbers' });
            }
            else if (!validator.isLength(password, {min:6, max: undefined})) {
                console.log('3')
                errors.push({ message: 'Password must be at least 6 characters' });
            }
            else if ((age < 1) || (age > 120)) {
                console.log('4')
                errors.push({ message: 'Please let other players know your age' });
            }
            else if (validator.isEmpty(gender)) {
                console.log('5')
                errors.push({ message: 'Please let other players know your preferred gender' });
            }
            if (errors.length > 0) {
                console.log('past validators')
                const error = new Error('Invalid input');
                error.data = errors;
                error.code = 401;   
                throw error;
            }
            return User.create({
                name: args.userInput.name,
                password: args.userInput.password,
                phoneNumber: args.userInput.phoneNumber, 
                age: args.userInput.age,
                gender: args.userInput.gender
            })
            .then( user => {
                return user;
            })
            .catch(error => {
                console.log(error)
                throw error;
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
                    name: args.userInput.name || user.name,
                    password: args.userInput.password || user.password,
                    age: args.userInput.age || user.age,
                    gender: args.userInput.gender || user.gender,
                    status: args.userInput.status || user.status
                })
            })
            .then( result => {
                return result
            })
            .catch(error => {
                console.log(error);
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
            .catch(error => {
                console.log(error);
            });
        },
        login: (parent, args) => {
            const errors = [];
            return User.findOne({
                where: {
                    name: args.name,
                    password: args.password
                }
            })
            .then( user => {
                if (!user) {
                    const error = new Error('Username and password does not match our records');
                    error.data = errors;
                    error.code = 401;
                    throw error;
                }
                const token = jwt.sign(
                    {
                        userId: user.id.toString()
                    }, 
                    'secret', 
                    { expiresIn: '24h' }
                );
                console.log('logged in')
                return { token: token, userId: user.id.toString() };
            }).catch(error => {
               throw error
            });
        },
    }
};

module.exports = resolvers;