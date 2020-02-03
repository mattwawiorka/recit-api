const { Op, fn, col, literal } = require('sequelize');
const User = require('../models/user');
const jwt = require('jsonwebtoken');
const API = require('../api.json');
const fetch = require('node-fetch');
const twilio = require('twilio')(API.twilioSid, API.twilioToken);

const resolvers = {
    Query: {
        users: (parent, args, context) => {
            if (!context.isAuth) {
                const error = new Error('Unauthorized user');
                error.code = 401;
                throw error;
            }

            return User.findAll()
            .then( users => {
                return users;
            }).catch(error => {
                console.log(error);
                throw error;
            });
        },
        whoAmI: (parent, args, context) => {
            if (!context.isAuth) {
                const error = new Error('Unauthorized user');
                error.code = 401;
                throw error;
            }

            return {
                id: context.user,
                name: context.userName
            }
        },
        user: (parent, args, context) => {
            if (!context.isAuth) {
                const error = new Error('Unauthorized user');
                error.code = 401;
                throw error;
            }

            return User.findOne({
                raw: true,
                where: {
                    id: args.userId
                }
            })
            .then( user => {
                return {
                    node: user,
                    isMe: user.id == context.user
                };
            }).catch(error => {
                console.log(error);
                throw error;
            });
        },
        // User name search
        findUser: (parent, args, context) => {
            if (!context.isAuth) {
                const error = new Error('Unauthorized user');
                throw error;
            }

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
                                facebookId: facebookId,
                                verified: true
                            }
                        })
                        .spread( (user, created) => {
                            if (!created) {
                                const error = new Error('User already exists'); 
                                error.code = 400;
                                throw error; 
                            }

                            // Use Facebook API to get higher quality version of users profile pic
                            return fetch(`https://graph.facebook.com/${facebookId}/picture?height=720&width=720&access_token=${facebookToken}`)
                            .then(response => {
                                if (response.url) {
                                    return user.update({ profilePic: response.url })
                                    .then(user => {
                                        return true;
                                    })
                                } else {
                                    return true;
                                }
                            })   
                        })
                    } else {
                        const error = new Error(response.data.error.message); 
                        error.code = response.data.error.cdoe
                        throw error; 
                    }
                })
            })  
            .catch(error => {
                console.log(error);
                throw error;
            })
        },
        updateUser: (parent, args, context) => {
            if (!context.isAuth) {
                const error = new Error('Unauthorized user');
                error.code = 401;
                throw error;
            }

            if (args.userId != context.user) {
                const error = new Error('Unauthorized user');
                error.code = 401;
                throw error;
            }

            return User.findOne({
                where: {
                    id: context.user
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
            if (!context.isAuth) {
                const error = new Error('Unauthorized user');
                throw error;
            }

            return User.destroy({
                where: {
                    id: context.user
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
                                error.code = 401;
                                throw error;
                            }

                            // Use Google maps API to get city from browser location
                            return fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${loginLocation[0]},${loginLocation[1]}&key=${API.google}`)
                            .then(response => {
                                return response.json()
                                .then(result => {
                                    console.log(result)
                                    return user.update({ 
                                        loginLocation: { type: 'Point', coordinates: loginLocation }, 
                                        city: result ? result.results[7].formatted_address : "Somewhere"
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
                        const error = new Error(response.data.error.message); 
                        error.code = response.data.error.cdoe
                        throw error;  
                    }    
                })    
            }).catch(error => {
                console.log(error);
                throw error
            });
        },
        // Create the user record to be verified with the SMS code provided at signup
        createUserPhone: (parent, args, context) => {

            const code = Math.floor(100000 + Math.random() * 900000);

            return User.findOne({
                where: {
                    phoneNumber: args.phoneNumber
                }
            })
            .then( user => {
                if (!user) {
                    return twilio.messages.create({
                        body: 'Here is your Rec-it access code: ' + code,
                        from: '+12034576851',
                        to: '+1' + args.phoneNumber
                    })
                    .then(message => {
                        if (message) {
                            return User.create({
                                phoneNumber: args.phoneNumber,
                                phoneCode: code
                            })
                            .then( user => {
                                if (user) {
                                    return true;
                                } else {
                                    const error = new Error('Server error, please try again');  
                                    throw error; 
                                }
                            })
                        } else {
                            const error = new Error('Could not send SMS to the provided phone number');  
                            throw error; 
                        }             
                    })
                } else {
                    const error = new Error('User with that phone number already exists');  
                    throw error; 
                }
            })
            .catch(error => {
                console.log(error)
                if (error.code === 21211 || error.code === 21608) {
                    error.code = 400;
                    error.message = 'Could not send SMS to the provided phone number';
                }
                throw error;
            })
        },
        // Reset existing user's SMS code for verification at login
        loginPhone: (parent, args, context) => {

            const code = Math.floor(100000 + Math.random() * 900000);

            return User.findOne({
                where: {
                    phoneNumber: args.phoneNumber
                }
            })
            .then( user => {
                if (user) {
                    return twilio.messages.create({
                        body: 'Here is your Rec-it access code: ' + code,
                        from: '+12034576851',
                        to: '+1' + args.phoneNumber
                    })
                    .then( message => {
                        if (message) {
                            return user.update({ phoneCode: code, verified: false })
                            .then(result => {
                                if (result) {
                                    return true;
                                }
                                else {
                                    const error = new Error('Server error, please try again');  
                                    throw error;
                                }
                            })
                        } else {
                            const error = new Error('Could not send SMS to the provided phone number');  
                            throw error; 
                        }
                    })
                } else {
                    const error = new Error('Could not find user with that phone number');  
                    throw error; 
                }
            })
            .catch(error => {
                console.log(error);
                throw error;
            });
        },
        // Log user in given the correct SMS verification code
        verifyUserPhone: (parent, args, context) => {

            const { phoneNumber, phoneCode, loginLocation, name, dob, gender } = args.userInput;

            return User.findOne({
                where: {
                    phoneNumber: phoneNumber,
                    phoneCode: phoneCode.toString().length < 7 ? phoneCode : 1
                }
            })
            .then( user => {
                // Phonenumber 
                if (user) {
                    // Use Google maps API to get city from browser location
                    return fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${loginLocation[0]},${loginLocation[1]}&key=${API.google}`)
                    .then(response => {
                        return response.json()
                        .then(result => {
                            return user.update({ 
                                loginLocation: { type: 'Point', coordinates: loginLocation }, 
                                city: result ? result.results[7].formatted_address : "Somewhere",
                                name: name || user.name,
                                dob: dob || user.dob,
                                gender: gender || user.gender,
                                verified: true
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
                // Code didn't match up existing user
                } else {
                    const error = new Error('Could not verify user, please try again');
                    throw error;  
                }
            })
            .catch(error => {
                console.log(error);
                throw error;
            })
        },
    }
};

module.exports = resolvers;