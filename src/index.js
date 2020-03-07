const TelegramBot = require('node-telegram-bot-api')
const mongoose = require('mongoose')
const config = require('./config')
const helper = require('./helper')
const _ = require('lodash')
const geolib = require('geolib')
const keyboard = require('./keyboard')
const kb = require('./keyboardButtons')
const database = require('../database.json')

helper.logStart()
mongoose.Promise = global.Promise


async function connectToDb() {

    try {
        await mongoose.connect(config.DB_URL, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        })
        console.log('Connected to Mongo DB')
        
    } catch (error) {
        console.log(error)
    }
    
    
}
connectToDb()

require('./models/film.model')
require('./models/cinema.model')
require('./models/user.model')

const Film = mongoose.model('films')
// database.films.forEach(element => {
//     new Film(element).save()    
// });
const Cinema = mongoose.model('cinemas')
// database.cinemas.forEach(element => {
//     new Cinema(element).save()
// })
const User = mongoose.model('users')


//============================================================

const ACTION_TYPE = {
    TOGGLE_FAV_FILM: 'TFF',
    SHOW_CINEMAS: 'SC',
    SHOW_CINEMAS_MAP: 'SCM',
    SHOW_FILMS: 'SF'
}

const bot = new TelegramBot(config.TOKEN, {
    polling: true
})

bot.on('message', msg => {
    console.log('Working', msg.from.first_name)
    
    const chatId = helper.getChatId(msg)

    switch(msg.text) {
        case kb.home.favourite:
            showFavouriteFilms(chatId, msg.from.id)
          break

        case kb.home.films:
            bot.sendMessage(chatId, `Выберите жанр:`, {
                reply_markup: {keyboard: keyboard.film}
            })
          break

        case kb.home.cinemas:
            bot.sendMessage(chatId, `Send your location`, {
                reply_markup: { keyboard: keyboard.cinemas }
            })
          break
        
        case kb.film.action:
            sendFilmByQuery(chatId, {type: 'action'})
          break

        case kb.film.comedy:
            sendFilmByQuery(chatId, {type: 'comedy'})
          break
        
        case kb.film.random:
            sendFilmByQuery(chatId, {})
          break  

        case kb.back:
            bot.sendMessage(chatId, `Что хотите посмотреть?`,{
                reply_markup: {keyboard: keyboard.home}
            })
          break
    }

    if(msg.location){
    
        getCinemaInCoord(chatId, msg.location)
    }
})

bot.on('callback_query', query => {
    
    let data
    const userId = query.from.id

    try {
        data = JSON.parse(query.data)
    } catch (error) {
        throw new Error('Data parsing error')
    }

    switch (data.type) {
        case ACTION_TYPE.TOGGLE_FAV_FILM:
            toggleFavouriteFilm(userId, query.id, data)
            break;

        case ACTION_TYPE.SHOW_CINEMAS:
            showCinemas(userId, data.cinemaUuids)
            break;    
    
        case ACTION_TYPE.SHOW_CINEMAS_MAP:
            bot.sendLocation(userId, data.lat, data.lon)
            break;

        case ACTION_TYPE.SHOW_FILMS:
            sendFilmByQuery(userId, {uuid: {'$in': data.filmUuids}})
            break;
        default:
            console.log('unknown keyboard key')
            break;
    }
})

bot.on('inline_query', query => {
    Film.find({})
    .then((movies) => {
        const results = movies.map(f => {
            const caption = `Название: ${f.name}\nГод выпуска: ${f.year}\nРейтинг: ${f.rate}\nДлительность: ${f.length}\nСтрана: ${f.country}\n`
            return {
                id: f.uuid,
                type: 'photo',
                photo_url: f.picture,
                thumb_url: f.picture,
                caption: caption,
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: `Кинопоиск: ${f.name}`,
                                url: f.link
                            }
                        ]
                    ]
                }

            }
        })

        bot.answerInlineQuery(query.id, results, {
            cache_time: 0
        })
    })
})

bot.onText(/\/start/, msg => {
    const text = `HEllo, ${msg.from.first_name}\nВыбирите команду для начала работы`
    bot.sendMessage(helper.getChatId(msg), text, {
        reply_markup: {
            keyboard: keyboard.home 
        }
    })
})

bot.onText(/\/f(.+)/, (msg, [source, match]) => {
    Promise.all([
        Film.findOne({uuid: match}),
        User.findOne({telegramId: msg.from.id})
    ]).then(([foundMovie, foundUser]) => {

        let isFav = false;
        
        if(foundUser){
            isFav = foundUser.films.indexOf(foundMovie.uuid) !== -1
        }

        let favText = isFav ? 'Удалить из избранного' : 'Добавить в избранное'

            const caption = `Название: ${foundMovie.name}\nГод выпуска: ${foundMovie.year}\nРейтинг: ${foundMovie.rate}\nДлительность: ${foundMovie.length}\nСтрана: ${foundMovie.country}\n`
            bot.sendPhoto(helper.getChatId(msg), foundMovie.picture, {
                caption: caption,
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: favText,
                                callback_data: JSON.stringify({
                                    type: ACTION_TYPE.TOGGLE_FAV_FILM,
                                    filmUuid: foundMovie.uuid,
                                    isFav: isFav
                                })
                            },
                            {
                                text: 'Показать кинотеатры',
                                callback_data: JSON.stringify({
                                    type: ACTION_TYPE.SHOW_CINEMAS,
                                    cinemaUuids: foundMovie.cinemas
                                })
                            }
                        ],
                        [
                            {
                                text: `Кинопоиск ${foundMovie.name}`,
                                url: foundMovie.link
                            }
                        ]
                    ]
                } 
            })
            
            })
            
    
})

bot.onText(/\/c(.+)/, async (msg, [source, match]) => {
    const foundCinema = await Cinema.findOne({uuid: match})
     bot.sendMessage(msg.chat.id, `Кинотеатр ${foundCinema.name}`, {
        reply_markup:{
            inline_keyboard: [
                [
                    {
                        text: foundCinema.name,
                        url: foundCinema.url
                    },
                    {
                        text: 'Показать на карте',
                        callback_data: JSON.stringify({
                            type: ACTION_TYPE.SHOW_CINEMAS_MAP,
                            lat: foundCinema.location.latitude,
                            lon: foundCinema.location.longitude
                        })
                    }
                ],
                [
                    {
                        text: 'Фильмы в прокате',
                        callback_data: JSON.stringify({
                            type: ACTION_TYPE.SHOW_FILMS,
                            filmUuids: foundCinema.films
                        })
                    }
                ]
            ]
        }
    })
    
})

//=================================================================================


async function sendFilmByQuery(chatId, query) {
    
    const resultArr = await Film.find(query)
    
    const html = resultArr.map((item, index) => {
        return `<b>${index + 1}.</b> ${item.name} - /f${item.uuid}`
    }).join('\n')

    sendHtml(chatId, html, 'films')

}

async function getCinemaInCoord(chatId, location) {
   let cinemas = await Cinema.find({})
   cinemas.forEach(c => {
       c.distance = geolib.getDistance(location, c.location)/1000
   })
   cinemas = _.sortBy(cinemas, 'distance')
   const html = cinemas.map((c,i) => {
       return `<b> ${i+1}. </b> ${c.name} <em>Расстояние</em> - <strong>${c.distance}</strong> км /c${c.uuid}`
   }).join('\n')
   
   sendHtml(chatId, html, 'home')
}

function sendHtml(chatId, html, kbName = null) {

    const objOptions = {
        parse_mode: 'HTML'
    }
    
    if(kbName) {
        objOptions.reply_markup = {
            keyboard: keyboard[kbName]
        }
    } 

    bot.sendMessage(chatId, html, objOptions)
}

function toggleFavouriteFilm(userId, queryId, {filmUuid, isFav}) {
    
    let userWillSave

    User.findOne({telegramId: userId})
    .then( user => {
        if(user) {
            if(isFav){
                user.films = user.films.filter(fUuid => fUuid !== filmUuid)
            } else {
                user.films.push(filmUuid)
            }
            userWillSave = user
        } else {
            userWillSave = new User({telegramId: userId, films: [filmUuid]})
            
        }

        const answerText = isFav ? 'Deleted' : 'Added'

        userWillSave.save().then(_ => {
            bot.answerCallbackQuery({
                callback_query_id: queryId, 
                text: answerText
            })
        })
        .catch(err => console.log(err))

    })
    .catch( err => console.log(err))
}

function showFavouriteFilms(chatId, userId){
    User.findOne({telegramId: userId})
    .then((foundUser)=>{
        if(foundUser){
            Film.find({uuid: {'$in': foundUser.films}})
            .then( foundMovies => {
                let html
                if(foundMovies.length){
                    html =`<strong>Ваши фильмы в категории избранное:\n</strong>` 
                            + foundMovies.map(( f, i ) => {
                                return `<b>${ i + 1 }.</b> "${f.name}" <em>рейтинг - ${f.rate} </em> link - /f${f.uuid}`
                            }).join('\n') 
                }else{
                    html = "У Вас нет фильмов в категории избранное"
                }
                sendHtml(chatId, html, 'home')
            })
            
        } else{
            sendHtml(chatId, 'User has not been found', home)
        }
    })
}

function showCinemas(userId, cinemasArray) {
    Cinema.find({uuid: {'$in': cinemasArray}})
    .then(cinemas => {
        let html = `<strong>Фильм можете постотреть в кинотеатрах:\n</strong>`
        + cinemas.map(( c, i ) => {
            return `<b> ${i + 1}.</b> ${c.name} /c${c.uuid}`
        }).join('\n')

        sendHtml(userId, html, 'home')
    })
    
}


