const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();
require('colors');
const app = express();
const port = process.env.PORT || 3500;

//Middle wares
app.use(cors());
app.use(express());

// configure MongoDB

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vqm0pbr.mongodb.net/?retryWrites=true&w=majority`;
console.log(uri);
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        console.log('Database Connected'.yellow);
    } catch (error) {
        console.log(error.name.bgRed, error.message.bold, error.stack);
    }
}
run();

const treatmentCollection = client.db('DentistsPortal').collection('treatments');

// find the treatments
app.get('/treatments', async (req, res) => {
    try {
        const cursor = treatmentCollection.find({});
        const treatments = await cursor.toArray();
        res.send(treatments)
        // res.send({
        //     status: true,
        //     treatments: treatments
        // })
    } catch (error) {
        console.log(error.name.bgRed, error.message.bold);
        res.send({
            status: false,
            error: error.message
        })

    }
})

app.get('/', (req, res) => {
    res.send("Dentists Portal Server is Running");
})

app.listen(port, () => {
    console.log(`Dental Server is running on port ${port}`.cyan.bold);
})