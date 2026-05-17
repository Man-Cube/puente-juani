const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors()); 
app.use(express.json()); 

const headersScanntech = {
    "Authorization": "Basic QUQxMTE0OCRpcG9zc2IzYXI6R1VTVEkxMA==",
    "Content-Type": "application/json",
    "emp_codigo": "11148",
    "gestion": "1222"
};

// LA NUEVA MAGIA: EL BUSCADOR DE PRODUCTOS
app.get('/buscar/:codigo', async (req, res) => {
    const codigo = req.params.codigo;
    console.log("Buscando artículo en la base, Chacho. Código:", codigo);
    
    try {
        // Intento 1: Buscar por código de barras
        let url = `https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/datos-basicos-articulos?filter=codigoBarras%253AEQ%253A${codigo}`;
        let respuesta = await fetch(url, { method: "GET", headers: headersScanntech });
        let data = await respuesta.json();

        // Extraemos el producto venga como venga
        let articulo = Array.isArray(data) ? data[0] : (data.content ? data.content[0] : (data.codigo ? data : null));

        // Intento 2: Si no lo encontró, buscamos por código cortito (Externo/PLU)
        if (!articulo) {
            console.log("No se encontró por código de barras. Probando código PLU interno...");
            url = `https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/datos-basicos-articulos?filter=codigoExterno%253AEQ%253A${codigo}`;
            respuesta = await fetch(url, { method: "GET", headers: headersScanntech });
            data = await respuesta.json();
            articulo = Array.isArray(data) ? data[0] : (data.content ? data.content[0] : (data.codigo ? data : null));
        }

        if (articulo) {
            console.log("¡Artículo encontrado y listo para enviar al celu!");
            res.json({ exito: true, articulo: articulo });
        } else {
            console.log("Artículo fantasma. No existe en Scanntech.");
            res.status(404).json({ exito: false, error: "No encontrado" });
        }
    } catch (error) {
        console.error("Error en la búsqueda:", error);
        res.status(500).json({ exito: false, error: "Error interno del puente" });
    }
});

// EL ACTUALIZADOR (EL QUE YA ANDA PERFECTO)
app.post('/modificar-precio', async (req, res) => {
    console.log("¡Recibida orden de actualización!");
    try {
        const respuestaScanntech = await fetch("https://backend-k8.scanntech.com/be-modulos-precios-angular-2.132.30-MINARG/api/articulos/salvar-lote", {
            method: "PUT",
            headers: headersScanntech,
            body: JSON.stringify(req.body)
        });

        if (respuestaScanntech.ok) {
            console.log("¡Scanntech aceptó el cambio de precio!");
            res.json({ exito: true });
        } else {
            const motivo = await respuestaScanntech.text();
            console.log("Scanntech rebotó. Código:", respuestaScanntech.status);
            console.log("Motivo:", motivo);
            res.status(400).json({ exito: false });
        }
    } catch (error) {
        console.error("Error en el puente:", error);
        res.status(500).json({ exito: false });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor de Autoservicio Juani ACTIVO en el puerto ${PORT}`);
});
