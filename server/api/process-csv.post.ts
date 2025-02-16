import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';
import { Readable } from 'stream';
import {Transform} from "node:stream";

export default defineEventHandler(async (event) => {
    console.log(123)
    // Parse the multipart form data
    const form = await readMultipartFormData(event);
    const csvFile = form?.find((field) => field.name === 'file')?.data;
    const userPrompt = form?.find((field) => field.name === 'prompt')?.data.toString();
    if (!csvFile || !userPrompt) {
        throw createError({ statusCode: 400, message: 'File and prompt are required.' });
    }

    // Extract headers from the CSV file
    const headerStream = Readable.from(csvFile).pipe(parse({ to_line: 1 }));
    const headers = await new Promise((resolve, reject) => {
        headerStream.on('data', (row) => resolve(row));
        headerStream.on('error', (err) => reject(err));
    });

    // Generate the filtering function using the AI model
    const ai = hubAI();
    const response = await hubAI().run('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', {
        prompt: 'Who is the author of Nuxt?'
    })
    return {
        statusCode: 200,
        body: response
    }

    const aiResponse = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
        prompt: `Given a CSV with the following columns: ${headers.join(
            ', '
        )}, generate a JavaScript function that returns true for rows that match the following criteria: ${userPrompt}`,
    });

    const filterFunction = new Function('row', aiResponse.result);

    // Set response headers for CSV download
    event.node.res.setHeader('Content-Type', 'text/csv');
    event.node.res.setHeader('Content-Disposition', 'attachment; filename="filtered.csv"');

    // Create a stream to process and filter the CSV data
    const dataStream = Readable.from(csvFile).pipe(parse({ columns: true }));
    const transformStream = new Transform({
        objectMode: true,
        transform(row, encoding, callback) {
            console.log(row)
            try {
                if (filterFunction(row)) {
                    callback(null, row);
                } else {
                    callback();
                }
            } catch (err) {
                callback(err);
            }
        },
    });
    const outputStream = stringify({ header: true, columns: headers });

    // Pipe the streams together and handle errors
    dataStream
        .pipe(transformStream)
        .pipe(outputStream)
        .pipe(event.node.res)
        .on('error', (err) => {
            console.error('Stream processing error:', err);
            event.node.res.statusCode = 500;
            event.node.res.end('An error occurred while processing the CSV.');
        });
    return {
        statusCode: 200,
    }
});
