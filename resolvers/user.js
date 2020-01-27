const { Op, fn, col, literal } = require('sequelize');
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
                raw: true,
                where: {
                    id: args.userId
                }
            })
            .then( user => {
                console.log(user)
                return user;
            }).catch(error => {
                throw error;
            });
        },
        findUser: (parent, args, context) => {

            let options = {
                where: {
                    name: {
                        [Op.like]: '%' + args.name + '%'
                    },
                    id : {
                        [Op.ne]: context.user
                    }
                },
                limit: 15,
                attributes: {}
            }

            if (args.location) {
                options.attributes.include = [
                    [
                        fn(
                          'ST_Distance',
                          col('loginLocation'),
                          fn('Point', args.location[0], args.location[1])
                        ),
                        'distance'
                    ]
                ];

                options.order = literal('distance ASC');
            }

            return User.findAll(options);
        }
    },
    Mutation: {
        createUser: (parent, args) => {
            const { name, phoneNumber, password, dob, gender } = args.userInput;
            const errors = [];
            const namePattern = /^[a-z0-9\s]+$/i;

            if (!name || !password || !phoneNumber || !dob || !gender) {
                errors.push({ message: 'Please fill in all required fields' });
            }
            else if (!namePattern.test(name)) {
                errors.push({ message: 'Username an only contain letters and numbers' });
            }
            else if (!validator.isLength(password, {min:6, max: undefined})) {
                errors.push({ message: 'Password must be at least 6 characters' });
            }
            // else if ((dob < 1) || (dob > 120)) {
            //     errors.push({ message: 'Please let other players know your age' });
            // }
            else if (validator.isEmpty(gender)) {
                errors.push({ message: 'Please let other players know your preferred gender' });
            }
            if (errors.length > 0) {
                const error = new Error('Invalid input');
                error.data = errors;
                error.code = 401;   
                throw error;
            }
            return User.create({
                name: args.userInput.name,
                password: args.userInput.password,
                phoneNumber: args.userInput.phoneNumber, 
                dob: args.userInput.dob,
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
            console.log(args)
            return User.findOne({
                where: {
                    id: args.id
                }
            })
            .then( user => {
                return user.update({
                    name: args.userInput.name || user.name,
                    userName: args.userInput.userName || user.userName,
                    password: args.userInput.password || user.password,
                    dob: args.userInput.dob || user.dob,
                    gender: args.userInput.gender || user.gender,
                    status: args.userInput.status || user.status,
                    profilePic: args.userInput.profilePic || user.profilePic
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
            console.log(args)
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

                return user.update({ loginLocation: { type: 'Point', coordinates: args.location }, city: args.city })
                .then(() => {
                    const token = jwt.sign(
                        {
                            userId: user.id.toString(),
                            userName: user.name.toString()
                        }, 
                        'secret', 
                        // { expiresIn: '24h' }
                    );
                    return { token: token };
                })
            }).catch(error => {
               throw error
            });
        },
    }
};

module.exports = resolvers;