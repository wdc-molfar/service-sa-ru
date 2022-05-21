const { extend } = require("lodash")
const path = require("path")

const {
    ServiceWrapper,
    AmqpManager,
    Middlewares,
    promClient,
    createLogger,
    createMonitor,
    yaml2js
} = require("@molfar/service-chassis")


const SentimentAnalyzer = require("./src/javascript/bridge")
const serviceSetup = require(path.resolve(__dirname,"./package.json")).sentimentAnalysis


 const config = {
     mode: 'text',
     encoding: 'utf8',
     pythonOptions: ['-u'],
     pythonPath: (process.env.NODE_ENV && process.env.NODE_ENV == "production") ? 'python' : 'python.exe',
     pythonScript: path.resolve(__dirname,"../python/main.py"),
     args: path.resolve(__dirname,"./model.ftz")
 }
 const analyser = new SentimentAnalyzer(config)

analyser.start()


let service = new ServiceWrapper({
    consumer: null,
    publisher: null,
    config: null,

    async onConfigure(config, resolve) {
        this.config = config

        console.log(`configure ${ this.config._instance_name || this.config._instance_id}`)

        this.consumer = await AmqpManager.createConsumer(this.config.service.consume)
        await this.consumer.use([
            Middlewares.Json.parse,
            Middlewares.Schema.validator(this.config.service.consume.message),
            Middlewares.Error.Log,
            Middlewares.Error.BreakChain,
            
            Middlewares.Filter( msg =>  {
                if( msg.content.metadata.nlp.language.locale != serviceSetup.lang) {
                    console.log(`${ this.config._instance_name || this.config._instance_id} ignore `, msg.content.md5, msg.content.metadata.nlp.language.locale)
                    msg.ack()
                } 
                return msg.content.metadata.nlp.language.locale == serviceSetup.lang
            }),

            async (err, msg, next) => {
                try {
                    let m = msg.content
                    
                    let res = await analyser.getSentiments({
                        text: m.metadata.text.replace(/\n+/g," ")
                    })
                    
                    m.metadata.nlp = extend({}, m.metadata.nlp, 
                        {
                            sentiments: res.data
                        }
                    )
                    this.publisher.send(m)
                    console.log(`${ this.config._instance_name || this.config._instance_id} recognize sentiments `, m.md5, `${res} `)
                    msg.ack()
                }    
                catch(e){
                    console.log("ERROR", e)
                }    
            }

        ])

        this.publisher = await AmqpManager.createPublisher(this.config.service.produce)
        
        await this.publisher.use([
            Middlewares.Schema.validator(this.config.service.produce.message),
            Middlewares.Error.Log,
            Middlewares.Error.BreakChain,
            Middlewares.Json.stringify
        ])



        resolve({ status: "configured" })

    },

    onStart(data, resolve) {
        console.log(`start ${ this.config._instance_name || this.config._instance_id}`)
        this.consumer.start()
        resolve({ status: "started" })
    },

    async onStop(data, resolve) {
        console.log(`stop ${ this.config._instance_name || this.config._instance_id}`)
        await this.consumer.close()
        await this.publisher.close()
        resolve({ status: "stoped" })
    }

})

service.start()