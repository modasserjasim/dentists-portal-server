const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();
require('colors');
const app = express();
const port = process.env.PORT || 3500;

//Middle wares
app.use(cors());
app.use(express.json());

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
const bookingCollection = client.db('DentistsPortal').collection('bookings');

// use aggregate to query multiple collection and then merge data
app.get('/treatments', async (req, res) => {
    try {
        const date = req.query.date;
        // console.log(date);
        const cursor = treatmentCollection.find({});
        const treatments = await cursor.toArray();

        //get the bookings of the provided date
        const bookingQuery = { appointmentDate: date };
        const alreadyBooked = await bookingCollection.find(bookingQuery).toArray();

        treatments.forEach(treatment => {
            const treatmentBooked = alreadyBooked.filter(book => book.treatmentName === treatment.name)
            const bookedSlots = treatmentBooked.map(book => book.AppointmentTime);
            const remainingSlots = treatment.slots.filter(slot => !bookedSlots.includes(slot));
            treatment.slots = remainingSlots;
            // console.log(date, treatment.name, remainingSlots.length);
        })

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

// insert booking info to db
app.post('/booking', async (req, res) => {
    try {
        const booking = req.body;
        // console.log(booking);
        const result = await bookingCollection.insertOne(req.body)
        // console.log(result);
        if (result.insertedId) {
            res.send({
                status: true,
                message: `Your Booking for ${req.body.treatmentName}  successfully confirmed! Please check your email for more details.`
            })
        } else {
            res.send({
                status: false,
                error: "Error Occurred!"
            })
        }
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