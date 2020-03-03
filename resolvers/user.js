const { Op, fn, col, literal } = require('sequelize');
const User = require('../models/user');
const Player = require('../models/player');
const Game = require('../models/game');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
const sharp = require('sharp');
const https = require('https');
const fs = require('fs');
const path = require('path');

const debug = require('debug')('user');

const saveImage = (url, userId) => {
    let dir = path.join(__dirname, '../images/' + userId + '/');

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    } 

    let timeStamp = '_' + Date.now() + '_';

    let path = dir + 'facebook' + timeStamp + '.jpg';
    const file = fs.createWriteStream(path);

    https.get(url, response => {
        response.pipe(file);

        // Create thumbnail, small, medium, and large copies of profile pic
        return sharp(path)
        .resize(48, 48)
        .toFile(dir + 'THUMB_facebook' + timeStamp + '.jpg')
        .then(() => {
            return sharp(req.file.path)
            .resize(175, 175)
            .toFile(dir + 'SMALL_facebook' + timeStamp + '.jpg')
            .then(() => {
                return sharp(req.file.path)
                .resize(350, 350)
                .toFile(dir + 'MEDIUM_facebook' + timeStamp + '.jpg')
                .then(() => {
                    return sharp(req.file.path)
                    .resize(600, 600)
                    .toFile(dir + 'LARGE_facebook' + timeStamp + '.jpg')
                    .then(() => {
                        fs.unlink(path, error => debug(error)); 
                        return true;
                    })
                })
            })
        })
        .catch( error => {
            debug_images(error);
        })
    })
}

const resolvers = {
    Query: {
        // ADMIN view full users list
        users: (parent, args, context) => {
            // Only admin user (mjw) can view full users list
            if (context.user != 1) {
                const error = new Error('Unauthorized user');
                error.code = 401;
                throw error;
            }

            return User.findAll()
            .then( users => {
                return users;
            }).catch(error => {
                debug(error);
                throw error;
            });
        },
        // Get currently logged in user
        whoAmI: (parent, args, context) => {
            if (!context.isAuth) {
                return { id: null }
            }

            return User.findOne({
                where: {
                    id: context.user
                }
            })
            .then( user => {
                return {
                    id: context.user,
                    name: user.name,
                    profilePic: user.profilePic
                }
            })
        },
        // Get user from id
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
                debug(error);
                throw error;
            });
        },
        // User name search
        findUser: (parent, args, context) => {
            if (!context.isAuth) {
                const error = new Error('Unauthorized user');
                throw error;
            }         

            // 10 Users returned at a time
            let limit = 10;

            let options = {
                where: {
                    name: {
                        [Op.like]: '%' + args.name + '%'
                    },
                    id : {
                        [Op.ne]: context.user
                    }
                },
                limit: limit,
                attributes: {},
            }

            // If user includes jersey number in search, use it
            if (args.name.match(/\d{2}/)) {
                let jerseyNumber = args.name.match(/\d{2}/)[0];
                let index = args.name.match(/\d{2}/).index;
                options.where.number = jerseyNumber;
                options.where.name = {
                    [Op.like]: '%' + args.name.substring(0, index) + '%'
                }
            }

            // Sort by distance to users last login location
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

            // Cursor = distance
            if (args.cursor > 0) {
                options.where = {
                    name: {
                        [Op.like]: '%' + args.name + '%'
                    },
                    id : {
                        [Op.ne]: context.user
                    },
                    [Op.and]: literal('ST_Distance(`loginLocation`, Point(' + args.location[0] + ', ' + args.location[1] + ')) > ' + args.cursor)
                }
            }

            return User.findAndCountAll(options)
            .then( result => {
                let edges = [], endCursor; 
                result.rows.map( (user, index) => {
                    edges.push({
                        cursor: user.dataValues.distance,
                        node: user
                    });

                    if (index === result.rows.length - 1) {
                        endCursor = user.dataValues.distance;
                    }
                })
                return {
                    edges: edges,
                    pageInfo: {
                        endCursor: endCursor,
                        hasNextPage: result.count > limit
                    }
                } 
            });
        },
        // Get a users top played sport
        topSport: (parent, args, context) => {
            return Player.count({
                where : {
                    userId: args.userId
                },
                include: [
                    {
                        model: Game,
                        attributes: ['sport'],
                        where: {
                            // Only past (completed) games count
                            dateTime: {
                                [Op.lt]: Date.now()
                            }
                        }
                    }
                ],
                group: [literal('game.sport')]
            })
            .then(result => {
                let count = 0, top;
                result.map( (sport, index) => {
                    if (sport.count > count) {
                        count = sport.count;
                        top = index;
                    }
                })
                if (result.length > 0) {
                    return result[top].sport
                } else {
                    return 'TBD'
                }
            })
        },
    },
    Mutation: {
        // Create user from Facebook
        createUserFb: (parent, args) => {
            const { name, dob, gender, facebookId, facebookToken } = args.userInput;

            const jerseyNumber = Math.floor(10 + Math.random() * 90);

            // Verify Facebook access token is valid for our app
            return fetch(`https://graph.facebook.com/debug_token?input_token=${facebookToken}&access_token=${process.env.FB_APPID}|${process.env.FB_SECRET}`)
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
                                verified: true,
                                number: jerseyNumber
                            }
                        })
                        .spread( (user, created) => {
                            if (!created) {
                                const error = new Error('User already exists'); 
                                error.code = 400;
                                throw error; 
                            } else {
                                // Use Facebook graph API to get high quality verison of user's current profile pic
                                return fetch(`https://graph.facebook.com/${process.env.FB_APPID}/picture?height=600&width=600&access_token=${facebookToken}`)
                                .then(response => {
                                    if (response.url) {
                                        return saveImage(response.url, user.id);
                                    } else {
                                        return true;
                                    }
                                })
                            } 
                        })
                    } else {
                        const error = new Error(response.data.error.message); 
                        error.code = response.data.error.cdoe
                        throw error; 
                    }
                })
            })  
            .catch(error => {
                debug(error);
                throw error;
            })
        },
        // Login with Facebook
        loginFb: (parent, args) => {
            const { facebookToken, facebookId, loginLocation } = args.userInput;

            if (!loginLocation || loginLocation.length < 2) {
                loginLocation = [47.621354, -122.333289];
            }

            return fetch(`https://graph.facebook.com/debug_token?input_token=${facebookToken}&access_token=${process.env.FB_APPID}|${process.env.FB_SECRET}`)
            .then(response => {
                debug(response);
                return response.json()
                .then(response => {
                    debug(response);
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
                            return fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${loginLocation[0]},${loginLocation[1]}&key=${process.env.GOOGLE_KEY}`)
                            .then(response => {
                                return response.json()
                                .then(map_result => {
                                    let city;
                                    for (let i = 0; i < map_result.results.length; i++) {
                                        if (map_result.results[i].types.includes("locality")) {
                                            city = map_result.results[i].formatted_address;
                                            break;
                                        } else if (map_result.results[i].types.includes("country")) {
                                            city = map_result.results[i].formatted_address;
                                            break; 
                                        } else {
                                            city = "Somewhere"
                                        }
                                    }

                                    if (map_result.results.length > 1) {
                                        return user.update({ 
                                            loginLocation: { type: 'Point', coordinates: loginLocation }, 
                                            city: map_result ? city : "Somewhere"
                                        })
                                        .then(() => {
                                            const token = jwt.sign(
                                                {
                                                    userId: user.id.toString(),
                                                    userName: user.name.toString(),
                                                    userPic: user.profilePic.toString()
                                                }, 
                                                process.env.JWT_SECRET
                                            );
                                            return token;
                                        })
                                    } else {
                                        const token = jwt.sign(
                                            {
                                                userId: user.id.toString(),
                                                userName: user.name.toString(),
                                                userPic: user.profilePic.toString()
                                            }, 
                                            process.env.JWT_SECRET
                                        );
                                        return token;
                                    }                                  
                                })
                            })
                        })
                    } else {
                        const error = new Error(response.data.error.message); 
                        error.code = response.data.error.code;
                        throw error;  
                    }    
                })    
            }).catch(error => {
                debug(error);
                throw error;
            });
        },
        // Create the user record to be verified with the SMS code provided at signup
        createUserPhone: (parent, args, context) => {

            const code = Math.floor(100000 + Math.random() * 900000);

            const jerseyNumber = Math.floor(10 + Math.random() * 90);

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
                                phoneCode: code,
                                number: jerseyNumber
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
                debug(error)
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
                debug(error);
                throw error;
            });
        },
        // Log user in given the correct SMS verification code
        verifyUserPhone: (parent, args, context) => {

            const { phoneNumber, phoneCode, loginLocation, name, dob, gender } = args.userInput;

            if (name && !(/^[a-z\s]+$/i.test(name))) {
                const error = new Error('User name can only contain letters');
                error.code = 401;
                throw error;
            }

            if (!loginLocation || loginLocation.lengt < 2) {
                loginLocation = [47.621354, -122.333289];
            }

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
                    return fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${loginLocation[0]},${loginLocation[1]}&key=${process.env.GOOGLE_KEY}`)
                    .then(response => {
                        return response.json()
                        .then(map_result => {
                            let city;
                            for (let i = 0; i < map_result.results.length; i++) {
                                if (map_result.results[i].types.includes("locality")) {
                                    city = map_result.results[i].formatted_address;
                                    break;
                                } else if (map_result.results[i].types.includes("country")) {
                                    city = map_result.results[i].formatted_address;
                                    break;
                                } else {
                                    city = "Somewhere"
                                }
                            }

                            if (map_result.results.length > 1) {
                                return user.update({ 
                                    loginLocation: { type: 'Point', coordinates: loginLocation }, 
                                    city: map_result ? city : "Somewhere",
                                    name: name || user.name,
                                    dob: dob || user.dob,
                                    gender: gender || user.gender,
                                    verified: true
                                })
                                .then(() => {
                                    const token = jwt.sign(
                                        {
                                            userId: user.id.toString(),
                                            userName: user.name.toString(),
                                            userPic: user.profilePic.toString()
                                        }, 
                                        process.env.JWT_SECRET, 
                                        // { expiresIn: '24h' }
                                    );
                                    return token;
                                })
                            } else {
                                return user.update({  
                                    name: name || user.name,
                                    dob: dob || user.dob,
                                    gender: gender || user.gender,
                                    verified: true
                                })
                                .then(() => {
                                    const token = jwt.sign(
                                        {
                                            userId: user.id.toString(),
                                            userName: user.name.toString(),
                                            userPic: user.profilePic.toString()
                                        }, 
                                        process.env.JWT_SECRET, 
                                        // { expiresIn: '24h' }
                                    );
                                    return token;
                                })
                            }
                        })
                    })
                // Code didn't match up existing user
                } else {
                    const error = new Error('Could not verify user, please try again');
                    throw error;  
                }
            })
            .catch(error => {
                debug(error);
                throw error;
            })
        },
        updateUser: (parent, args, context) => {
            if (!context.isAuth || args.userId != context.user) {
                const error = new Error('Unauthorized user');
                error.code = 401;
                throw error;
            }

            if (args.userInput.name && !(/^[a-z\s]+$/i.test(args.userInput.name))) {
                const error = new Error('User name can only contain letters');
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
                    profilePic: args.userInput.profilePic ? process.env.IMAGE_PATH + context.user + '/' + args.userInput.profilePic : user.profilePic,
                    pic1: args.userInput.pic1 ? process.env.IMAGE_PATH + context.user + '/' + args.userInput.pic1 : user.pic1,
                    pic2: args.userInput.pic2 ? process.env.IMAGE_PATH + context.user + '/' + args.userInput.pic2 : user.pic2,
                    pic3: args.userInput.pic3 ? process.env.IMAGE_PATH + context.user + '/' + args.userInput.pic3 : user.pic3
                })
            })
            .then( result => {
                return result
            })
            .catch(error => {
                debug(error);
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
                debug(error);
            });
        },
        /************************** 
        *   ADMIN TEST FUNCTIONS  *
        ***************************/
        createTestUser: (parent, args, context) => {
            if (context.user != 1) {
                const error = new Error('Unauthorized user');
                error.code = 401;
                throw error;
            }

            const jerseyNumber = Math.floor(10 + Math.random() * 90);

            return User.create({
                name: args.name,
                dob: '08/27/1993',
                gender: 'male',
                loginLocation: args.location ? { type: 'Point', coordinates: args.location } : null,
                city: 'Seattle, WA, USA',
                number: jerseyNumber
            })
            .then(() => {
                return true
            })
        },
        loginTestUser: (parent, args, context) => {
            if (context.user != 1) {
                const error = new Error('Unauthorized user');
                error.code = 401;
                throw error;
            }

            return User.findOne({
                where: {
                    name: args.name
                }
            })
            .then((user) => {
                const token = jwt.sign(
                    {
                        userId: user.id.toString(),
                        userName: user.name.toString(),
                        userPic: user.profilePic.toString()
                    }, 
                    process.env.JWT_SECRET
                );
                return token;
            })
        },
    }
};

module.exports = resolvers;