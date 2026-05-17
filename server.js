const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors()); 
app.use(express.json()); 

app.post('/modificar-precio', async (req, res) => {
    console.log("¡Orden recibida en la nube, Chacho!");
    
    try {
        const respuestaScanntech = await fetch("https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/articulos/salvar-lote", {
            method: "PUT",
            headers: {
                "Authorization": "Basic QUQxMTE0OCRpcG9zc2IzYXI6R1VTVEkxMA==",
                "Content-Type": "application/json",
                "emp_codigo": "11148",
                "gestion": "1222"
            },
            body: JSON.stringify(req.body)
        });

        if (respuestaScanntech.ok) {
            console.log("¡Scanntech aceptó el cambio de precio!");
            res.json({ exito: true });
        } else {
            // Agregamos estas tres líneas para que cante todo
            const motivo = await respuestaScanntech.text();
            console.log("Scanntech rebotó. Código:", respuestaScanntech.status);
            console.log("Motivo exacto:", motivo);
            res.status(400).json({ exito: false });
        }

// Render nos dice en qué puerto arrancar
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor de Autoservicio Juani ACTIVO en el puerto ${PORT}`);
});
