export default defineEventHandler(async (event) => {
    const response = await hubAI().run('@cf/meta/llama-3.1-8b-instruct', {
        prompt: 'Who is the author of Nuxt?'
    })
    console.log(response)
    return {
        statusCode: 200
        body: response
    }
})
