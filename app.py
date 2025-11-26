from flask import Flask, render_template, request, jsonify, redirect, url_for, session
import mysql.connector
from mysql.connector import Error
from functools import wraps
import os


def create_app():
    app = Flask(__name__)
    app.secret_key = os.environ.get("FLASK_SECRET_KEY", "cambia-esto-en-produccion")

    app.config["DB_HOST"] = os.environ.get("DB_HOST", "localhost")
    app.config["DB_USER"] = os.environ.get("DB_USER", "root")
    app.config["DB_PASSWORD"] = os.environ.get("DB_PASSWORD", "")
    app.config["DB_NAME"] = os.environ.get("DB_NAME", "pwa_clientes")

    def get_db_connection():
        return mysql.connector.connect(
            host=app.config["DB_HOST"],
            user=app.config["DB_USER"],
            password=app.config["DB_PASSWORD"],
            database=app.config["DB_NAME"],
        )

    def login_required(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if "user" not in session:
                return redirect(url_for("login"))
            return f(*args, **kwargs)

        return decorated_function

    # ---------- RUTAS DE PÁGINAS ----------

    @app.route("/")
    def index():
        # Si ya está logueado, redirigir al dashboard
        if "user" in session:
            return redirect(url_for("dashboard"))
        return render_template("index.html")

    @app.route("/login", methods=["GET", "POST"])
    def login():
        # Si ya está logueado, redirigir al dashboard
        if "user" in session:
            return redirect(url_for("dashboard"))
        
        if request.method == "POST":
            username = request.form.get("username")
            password = request.form.get("password")

            # Usuario fijo: pepe / pepe
            if username == "pepe" and password == "pepe":
                session["user"] = {"username": "pepe"}
                return redirect(url_for("dashboard"))

            return render_template("login.html", error="Usuario o contraseña incorrectos")

        return render_template("login.html")

    @app.route("/logout")
    def logout():
        # Limpiar completamente la sesión
        session.clear()
        return redirect(url_for("index"))

    @app.route("/dashboard")
    @login_required
    def dashboard():
        response = app.make_response(render_template("dashboard.html"))
        # Evitar que se cachee la página protegida
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response

    @app.route("/clientes")
    @login_required
    def clientes_page():
        response = app.make_response(render_template("clientes.html"))
        # Evitar que se cachee la página protegida
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response

    # ---------- API REST CLIENTES ----------

    @app.route("/api/clientes", methods=["GET"])
    @login_required
    def get_clientes():
        try:
            conn = get_db_connection()
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT id, nombre, saldo FROM clientes ORDER BY id DESC")
            rows = cursor.fetchall()
            return jsonify({"success": True, "data": rows})
        except Error as e:
            return jsonify({"success": False, "error": str(e)}), 500
        finally:
            if "cursor" in locals():
                cursor.close()
            if "conn" in locals() and conn.is_connected():
                conn.close()

    @app.route("/api/clientes", methods=["POST"])
    @login_required
    def create_cliente():
        data = request.get_json()
        nombre = data.get("nombre", "").strip()
        saldo = data.get("saldo")

        if not nombre:
            return jsonify({"success": False, "error": "El nombre es obligatorio"}), 400

        try:
            saldo_val = float(saldo)
        except (TypeError, ValueError):
            return jsonify({"success": False, "error": "Saldo inválido"}), 400

        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO clientes (nombre, saldo) VALUES (%s, %s)",
                (nombre, saldo_val),
            )
            conn.commit()
            new_id = cursor.lastrowid
            return jsonify(
                {
                    "success": True,
                    "data": {"id": new_id, "nombre": nombre, "saldo": saldo_val},
                }
            )
        except Error as e:
            return jsonify({"success": False, "error": str(e)}), 500
        finally:
            if "cursor" in locals():
                cursor.close()
            if "conn" in locals() and conn.is_connected():
                conn.close()

    @app.route("/api/clientes/<int:cliente_id>", methods=["PUT"])
    @login_required
    def update_cliente(cliente_id):
        data = request.get_json()
        nombre = data.get("nombre", "").strip()
        saldo = data.get("saldo")

        if not nombre:
            return jsonify({"success": False, "error": "El nombre es obligatorio"}), 400

        try:
            saldo_val = float(saldo)
        except (TypeError, ValueError):
            return jsonify({"success": False, "error": "Saldo inválido"}), 400

        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE clientes SET nombre=%s, saldo=%s WHERE id=%s",
                (nombre, saldo_val, cliente_id),
            )
            conn.commit()
            if cursor.rowcount == 0:
                return jsonify({"success": False, "error": "Cliente no encontrado"}), 404
            return jsonify(
                {
                    "success": True,
                    "data": {"id": cliente_id, "nombre": nombre, "saldo": saldo_val},
                }
            )
        except Error as e:
            return jsonify({"success": False, "error": str(e)}), 500
        finally:
            if "cursor" in locals():
                cursor.close()
            if "conn" in locals() and conn.is_connected():
                conn.close()

    @app.route("/api/clientes/<int:cliente_id>", methods=["DELETE"])
    @login_required
    def delete_cliente(cliente_id):
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM clientes WHERE id=%s", (cliente_id,))
            conn.commit()
            if cursor.rowcount == 0:
                return jsonify({"success": False, "error": "Cliente no encontrado"}), 404
            return jsonify({"success": True})
        except Error as e:
            return jsonify({"success": False, "error": str(e)}), 500
        finally:
            if "cursor" in locals():
                cursor.close()
            if "conn" in locals() and conn.is_connected():
                conn.close()

    # ---------- RUTAS PWA ----------

    @app.route("/manifest.json")
    def manifest():
        return app.send_static_file("manifest.json")

    @app.route("/sw.js")
    def service_worker():
        return app.send_static_file("js/sw.js")

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True)


