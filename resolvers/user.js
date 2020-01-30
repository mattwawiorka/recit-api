const { Op, fn, col, literal } = require('sequelize');
const User = require('../models/user');
const jwt = require('jsonwebtoken');
const API = require('../api.json');
const fetch = require('node-fetch');

const resolvers = {
    Query: {
        users: () => {
            return User.findAll()
            .then( users => {
                return users;
            }).catch(error => {
                console.log(error);
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
                return user;
            }).catch(error => {
                console.log(error);
                throw error;
            });
        },
        // User name search
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
        // Create user from Facebook - no username for now
        // May decide to implement username in the future for better player searching
        createUserFb: (parent, args) => {
            const { name, dob, gender, facebookId, facebookToken } = args.userInput;
            const errors = [];

            // Verify Facebook access token is valid for our app
            return fetch(`https://graph.facebook.com/debug_token?input_token=${facebookToken}&access_token=${API.fbAppId}|${API.fbSecret}`)
            .then(response => {
                return response.json()
                .then(response => {
                    if (response.data.is_valid) {
                        return User.findOrCreate({
                            where: {
                                facebookId: facebookId
                            },
                            defaults: {
                                name: name,
                                dob: dob,
                                gender: gender,
                                facebookId: facebookId
                            }
                        })
                        .spread( (user, created) => {
                            if (!created) {
                                const error = new Error('User already exists');
                                error.data = errors;
                                error.code = 401;   
                                throw error; 
                            }

                            // Use Facebook API to get higher quality version of users profile pic
                            return fetch(`https://graph.facebook.com/${facebookId}/picture?height=720&width=720&access_token=${facebookToken}`)
                            .then(response => {
                                if (response.url) {
                                    return user.update({ profilePic: response.url })
                                    .then(user => {
                                        return user;
                                    })
                                }
                                return user;
                            })   
                        })
                        .catch(error => {
                            console.log(error)
                            throw error;
                        });
                    } else {
                        const error = new Error('Invalid Facebook access token');
                        error.data = errors;
                        error.code = 401;   
                        throw error; 
                    }
                })
            })  
            .catch(error => {
                console.log(error);
                throw error;
            })
        },
        updateUser: (parent, args) => {
            return User.findOne({
                where: {
                    id: args.userId
                }
            })
            .then( user => {
                return user.update({
                    name: args.userInput.name || user.name,
                    dob: args.userInput.dob || user.dob,
                    gender: args.userInput.gender || user.gender,
                    status: args.userInput.status || user.status,
                    profilePic: args.userInput.profilePic || user.profilePic,
                    pic1: args.userInput.pic1 || user.pic1,
                    pic2: args.userInput.pic2 || user.pic2,
                    pic3: args.userInput.pic3 || user.pic3
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
                    id: args.userId
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
        // Login with Facebook
        loginFb: (parent, args) => {
            const errors = [];

            const { facebookToken, facebookId, loginLocation } = args.userInput;

            return fetch(`https://graph.facebook.com/debug_token?input_token=${facebookToken}&access_token=${API.fbAppId}|${API.fbSecret}`)
            .then(response => {
                return response.json()
                .then(response => {
                    if (response.data.is_valid) {
                        return User.findOne({
                            where: {
                                facebookId: facebookId
                            }
                        })
                        .then( user => {
                            if (!user) {
                                const error = new Error('Cannot find user');
                                error.data = errors;
                                error.code = 401;
                                throw error;
                            }

                            // Use Google maps API to get city from browser location
                            return fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${loginLocation[0]},${loginLocation[1]}&key=${API.key}`)
                            .then(response => {
                                return response.json()
                                .then(result => {
                                    return user.update({ 
                                        loginLocation: { type: 'Point', coordinates: loginLocation }, 
                                        city: result ? result.results[5].formatted_address : "Somewhere"
                                    })
                                    .then(() => {
                                        const token = jwt.sign(
                                            {
                                                userId: user.id.toString(),
                                                userName: user.name.toString()
                                            }, 
                                            'secret', 
                                            // { expiresIn: '24h' }
                                        );
                                        return token;
                                    })
                                })
                            })
                        })
                    } else {
                        const error = new Error('Invalid Facebook access token');
                        error.data = errors;
                        error.code = 401;   
                        throw error; 
                    }    
                })    
            }).catch(error => {
               throw error
            });
        },
    }
};

module.exports = resolvers;