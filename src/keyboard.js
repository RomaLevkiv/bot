const kb = require('./keyboardButtons')
module.exports = {
    home: [
        [kb.home.films, kb.home.cinemas],
        [kb.home.favourite]
    ],  
  
    film: [
        [kb.film.random],
        [kb.film.action, kb.film.comedy],
        [kb.back]
    ], 

    cinemas: [
        [
            {
                text: 'Send location',
                request_location: true
            }
            
        ],
        [kb.back]
    ]
  }