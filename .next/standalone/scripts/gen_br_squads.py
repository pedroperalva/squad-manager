#!/usr/bin/env python3
"""Generate src/data/squads/teams/br.ts with Brazilian club squads."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "squads" / "teams" / "br.ts"

HEADER = '''import type { ClubSquadTemplate } from "@/data/squads/types";

function squad(slug: string, players: { name: string; position: "GK"|"DF"|"MF"|"FW" }[]): ClubSquadTemplate {
  return { slug, players };
}
'''

ORDER = [
    "FLAMENGO", "CORINTHI", "PALMEIRA", "SAOPAULO", "SANTOS", "CRUZEIRO", "GREMIO", "INTERNAC",
    "ATLET_MG", "FLUMINEN", "BOTAFOGO", "VSC_GAMA", "BAHIA", "SPORTREC", "CEARA", "GOIAS", "CORITIBA",
    "ATLET_PR", "VITORIA", "GUARANI", "PONTE_PR", "CRICIUMA", "BRAGANTI", "LONDRINA", "DESPORTI",
    "FERRO", "AMERI_SP", "INTER_BR", "ITUAN_BR", "JUVEN_BR", "LUSAS_BR", "MATON_BR", "MOGIM_BR",
    "RIOBR_BR", "SAOJO_BR", "NAUTICO", "SANTA_CR", "REMO", "FIGUEIR", "CHAPECO", "AMER_RJ",
]

# (name, position, age) — 2024/25 or early 2025/26 Brazilian football
SQUADS: dict[str, list[tuple[str, str, int]]] = {
    "FLAMENGO": [
        ("Rossi", "GK", 29), ("Matheus Cunha", "GK", 23),
        ("Wesley", "DF", 24), ("Varela", "DF", 26), ("Léo Ortiz", "DF", 29), ("Danilo Luiz", "DF", 33),
        ("Ayrton Lucas", "DF", 27), ("Gabi", "DF", 32), ("Viña", "DF", 26),
        ("Jorginho", "MF", 33), ("Gerson", "MF", 28), ("Allan", "MF", 34), ("Arrascaeta", "MF", 30),
        ("Pulgar", "MF", 30), ("Michael", "MF", 28),
        ("Luiz Araújo", "FW", 28), ("Pedro", "FW", 27), ("Gabigol", "FW", 28),
        ("Everton Cebolinha", "FW", 28), ("Carlinhos", "FW", 28),
    ],
    "CORINTHI": [
        ("Cássio", "GK", 37), ("Hugo Souza", "GK", 25),
        ("Matheus Bidu", "DF", 24), ("Fágner", "DF", 35), ("Cacá", "DF", 26), ("Tchoca", "DF", 21),
        ("Renato Santos", "DF", 24), ("Hugo", "DF", 21),
        ("Raniele", "MF", 27), ("Maycon", "MF", 27), ("Ravanelli", "MF", 29), ("Rodrigo Garro", "MF", 27),
        ("Charles", "MF", 28), ("Bidon", "MF", 20),
        ("Romero", "FW", 37), ("Memphis Depay", "FW", 31), ("Yuri Alberto", "FW", 24),
        ("Gui Negueba", "FW", 22), ("Japa", "FW", 23), ("Vitinho", "FW", 25),
    ],
    "PALMEIRA": [
        ("Weverton", "GK", 37), ("Mateus", "GK", 22),
        ("Mayke", "DF", 32), ("Marcos Rocha", "DF", 35), ("Murilo", "DF", 28), ("Luan", "DF", 31),
        ("Piquerez", "DF", 26), ("Vanderlan", "DF", 22),
        ("Aníbal Moreno", "MF", 25), ("Zé Rafael", "MF", 31), ("Maurício", "MF", 24),
        ("Emiliano Martínez", "MF", 26), ("Richard Ríos", "MF", 25), ("Fabinho", "MF", 24),
        ("Estêvão", "FW", 18), ("Dudu", "FW", 33), ("Rony", "FW", 29), ("Paulinho", "FW", 24),
        ("Flaco López", "FW", 24), ("Luighi", "FW", 19),
    ],
    "SAOPAULO": [
        ("Rafael", "GK", 35), ("Young", "GK", 23),
        ("Rafael Ramos", "DF", 29), ("Sabino", "DF", 28), ("Arboleda", "DF", 33), ("Ferraresi", "DF", 26),
        ("Wellington", "DF", 28), ("Patryck", "DF", 21), ("Cédric Soares", "DF", 34),
        ("Alisson", "MF", 31), ("Lucas", "MF", 28), ("Oscar", "MF", 33), ("Rodriguinho", "MF", 31),
        ("Pablo Maia", "MF", 23), ("Ferreira", "MF", 22),
        ("Luciano", "FW", 31), ("Calleri", "FW", 31), ("Erick", "FW", 28),
        ("Marcos Antônio", "FW", 24), ("William", "FW", 20),
    ],
    "SANTOS": [
        ("Diógenes", "GK", 26), ("João Paulo", "GK", 29),
        ("Escobar", "DF", 25), ("Gil", "DF", 37), ("Joaquim", "DF", 22), ("Souza", "DF", 24),
        ("Hayner", "DF", 28), ("Benjamín Kuscevic", "DF", 29),
        ("Barreto", "MF", 30), ("Giuliano", "MF", 34), ("Sotelo", "MF", 31), ("Cuesta", "MF", 26),
        ("Guilherme", "MF", 29), ("Joaquim", "MF", 22),
        ("Neymar", "FW", 33), ("Guilherme Borges", "FW", 21), ("Marcos Leonardo", "FW", 22),
        ("Wendel", "FW", 27), ("Angelo", "FW", 20), ("Guilherme", "FW", 29),
    ],
    "CRUZEIRO": [
        ("Cássio", "GK", 37), ("Anderson", "GK", 27),
        ("William", "DF", 30), ("Kaiki", "DF", 22), ("Marcelo", "DF", 36), ("Jonathan", "DF", 29),
        ("Marlon", "DF", 28), ("Agustin Sant'Anna", "DF", 27),
        ("Ramiro", "MF", 32), ("Lucas Silva", "MF", 31), ("Christian", "MF", 25), ("Matheus Pereira", "MF", 28),
        ("Rodrigo Nestor", "MF", 24), ("Walace", "MF", 29), ("Nicolas", "MF", 23),
        ("Gabriel Barbosa", "FW", 28), ("Keno", "FW", 35), ("Marquinhos", "FW", 22),
        ("Wanderson", "FW", 30), ("Vitinho", "FW", 25),
    ],
    "GREMIO": [
        ("Brenno", "GK", 25), ("Caíque", "GK", 27),
        ("Marlon", "DF", 27), ("Geromel", "DF", 39), ("Kannemann", "DF", 33), ("Reinaldo", "DF", 35),
        ("Mayk", "DF", 24), ("Fábio", "DF", 34),
        ("Pepê", "MF", 27), ("Villasanti", "MF", 28), ("Dodi", "MF", 28), ("Edenilson", "MF", 35),
        ("Du Queiroz", "MF", 26), ("Ronald", "MF", 22), ("Cristaldo", "MF", 28), ("Bitello", "MF", 24),
        ("Soteldo", "FW", 27), ("Everton", "FW", 28), ("Arezo", "FW", 22),
        ("Martin Braithwaite", "FW", 33),
    ],
    "INTERNAC": [
        ("Rochet", "GK", 32), ("Anthoni", "GK", 22),
        ("Bustos", "DF", 28), ("Vitão", "DF", 24), ("Mercado", "DF", 37), ("Bernabei", "DF", 24),
        ("Renê", "DF", 32), ("Rômulo", "DF", 23),
        ("Aránguiz", "MF", 35), ("Fernando", "MF", 33), ("Maurício", "MF", 23), ("Bruno Henrique", "MF", 30),
        ("Wesley", "MF", 26), ("Tabata", "MF", 25), ("Thiago Maia", "MF", 28),
        ("Enner Valencia", "FW", 35), ("Wanderson", "FW", 30), ("Borré", "FW", 28),
        ("Lucca", "FW", 21), ("Aguirre", "FW", 26),
    ],
    "ATLET_MG": [
        ("Everson", "GK", 34), ("Matheus Mendes", "GK", 24),
        ("Mariano", "DF", 36), ("Rubens", "DF", 24), ("Lyanco", "DF", 27), ("Júnior Alonso", "DF", 32),
        ("Dodô", "DF", 26), ("Natanael", "DF", 22),
        ("Otávio", "MF", 30), ("Bernard", "MF", 32), ("Alan Franco", "MF", 28), ("Alexsander", "MF", 21),
        ("Scarpa", "MF", 30), ("Patrick", "MF", 32),
        ("Hulk", "FW", 38), ("Paulinho", "FW", 24), ("Deyverson", "FW", 33), ("Cadu", "FW", 24),
        ("Isaac", "FW", 21), ("Biel", "FW", 24),
    ],
    "FLUMINEN": [
        ("Fábio", "GK", 44), ("Leo", "GK", 22),
        ("Guga", "DF", 26), ("Marcelo", "DF", 36), ("Nino", "DF", 27), ("Renê", "DF", 32),
        ("Felipe", "DF", 35), ("Ignacio", "DF", 26),
        ("André", "MF", 23), ("Martinelli", "MF", 23), ("Lima", "MF", 29), ("Nonato", "MF", 26),
        ("Ganso", "MF", 35), ("Keno", "MF", 35), ("Thiago Santos", "MF", 35),
        ("Cano", "FW", 36), ("Arias", "FW", 28), ("Marquinhos", "FW", 22),
        ("Lelê", "FW", 22), ("Isaque", "FW", 20),
    ],
    "BOTAFOGO": [
        ("John", "GK", 28), ("Raílson", "GK", 27),
        ("Vitinho", "DF", 25), ("Bastos", "DF", 33), ("Marçal", "DF", 35), ("Cuiabano", "DF", 22),
        ("Adryelson", "DF", 26), ("Baba", "DF", 28),
        ("Gregore", "MF", 30), ("Tchê Tchê", "MF", 32), ("Eduardo", "MF", 35), ("Allan", "MF", 34),
        ("Danilo Barbosa", "MF", 28), ("Marlon Freitas", "MF", 29),
        ("Jeffinho", "FW", 24), ("Savarino", "FW", 28), ("Tiquinho Soares", "FW", 34),
        ("Junior Santos", "FW", 30), ("Kauê", "FW", 21), ("Artur", "FW", 27),
    ],
    "VSC_GAMA": [
        ("Léo Jardim", "GK", 29), ("Alexander", "GK", 22),
        ("Paulo Henrique", "DF", 27), ("Léo", "DF", 28), ("Jair", "DF", 28), ("Victor Luis", "DF", 31),
        ("Robert Renan", "DF", 21), ("Pacheco", "DF", 24),
        ("Praxedes", "MF", 23), ("Payet", "MF", 38), ("Rossi", "MF", 27), ("Coutinho", "MF", 32),
        ("Maicon", "MF", 36), ("Medel", "MF", 37), ("Jair", "MF", 28),
        ("Vegetti", "FW", 36), ("David", "FW", 24), ("Rayan", "FW", 20),
        ("Adson", "FW", 24), ("Nuno Moreira", "FW", 25),
    ],
    "BAHIA": [
        ("Rafael", "GK", 35), ("Mateus", "GK", 24),
        ("Gilberto", "DF", 32), ("Iago", "DF", 27), ("Kanú", "DF", 28), ("Vanderson", "DF", 23),
        ("Adriel", "DF", 24), ("Jhoellys", "DF", 22),
        ("Thaciano", "MF", 29), ("Cauly", "MF", 29), ("Rezende", "MF", 29), ("Jean Lucas", "MF", 26),
        ("Biel", "MF", 24), ("Everton Ribeiro", "MF", 36),
        ("Ademir", "FW", 30), ("Everaldo", "FW", 33), ("Tiago", "FW", 28),
        ("Kayky", "FW", 21), ("Ryan", "FW", 24), ("Cauly", "FW", 29),
    ],
    "SPORTREC": [
        ("Caíque", "GK", 28), ("Renan", "GK", 34),
        ("Felipe", "DF", 35), ("Ewerthon", "DF", 27), ("Chico", "DF", 26), ("Dalbert", "DF", 31),
        ("Lucas Lima", "DF", 24), ("Ibañez", "DF", 25),
        ("Hyoran", "MF", 31), ("Chrystian", "MF", 28), ("Lucas Lima", "MF", 35), ("Romarinho", "MF", 33),
        ("Fabinho", "MF", 32), ("Matheusinho", "MF", 28), ("Felipe", "MF", 35),
        ("Pablo", "FW", 33), ("Lucas", "FW", 27), ("Diego Souza", "FW", 39),
        ("Hyoran", "FW", 31), ("Romarinho", "FW", 33),
    ],
    "CEARA": [
        ("Richard", "GK", 34), ("Keiller", "GK", 28),
        ("Marllon", "DF", 32), ("Éder", "DF", 28), ("Lucas", "DF", 26), ("Nicolas", "DF", 24),
        ("Richardson", "DF", 30), ("Fabiano", "DF", 29),
        ("Lourenço", "MF", 28), ("André", "MF", 27), ("De Lucca", "MF", 26), ("Kelvin", "MF", 31),
        ("Vina", "MF", 24), ("Richardson", "MF", 30), ("Lourenço", "FW", 28),
        ("Erick", "FW", 28), ("Deyverson", "FW", 33), ("Lucca", "FW", 21),
        ("Talisson", "FW", 24), ("Kaique", "FW", 22),
    ],
    "GOIAS": [
        ("Tadeu", "GK", 34), ("Marcão", "GK", 27),
        ("Sidimar", "DF", 32), ("Apodi", "DF", 38), ("Sander", "DF", 35), ("Anthony", "DF", 24),
        ("Caetano", "DF", 28), ("Tadeu", "DF", 34),
        ("Rildo", "MF", 28), ("Diego", "MF", 29), ("Baralhas", "MF", 29), ("Cristaldo", "MF", 28),
        ("Juninho", "MF", 27), ("Maguinho", "MF", 33), ("Pedro Raul", "MF", 28),
        ("Marcão", "FW", 27), ("Welliton", "FW", 24), ("Jorginho", "FW", 26),
        ("Pedro Raul", "FW", 28), ("Rildo", "FW", 28),
    ],
    "CORITIBA": [
        ("Gabriel", "GK", 28), ("Jordi", "GK", 25),
        ("Natã", "DF", 24), ("Henrique", "DF", 27), ("Maicon", "DF", 30), ("Jamerson", "DF", 26),
        ("Thalisson", "DF", 24), ("Joaquim", "DF", 22),
        ("Andrey", "MF", 22), ("Robson", "MF", 28), ("Brandão", "MF", 27), ("Giovanni", "MF", 24),
        ("Matheus Frizzo", "MF", 26), ("Wallace", "MF", 29),
        ("Júnior Brumado", "FW", 26), ("Brandão", "FW", 27), ("Giovanni", "FW", 24),
        ("Matheus Frizzo", "FW", 26), ("Robson", "FW", 28),
    ],
    "ATLET_PR": [
        ("Bento", "GK", 25), ("Mycael", "GK", 21),
        ("Khellven", "DF", 24), ("Fernando", "DF", 35), ("Thiago Heleno", "DF", 37), ("Abner", "DF", 24),
        ("Erick", "DF", 28), ("Pedro Henrique", "DF", 23),
        ("Christian", "MF", 25), ("Giuliano", "MF", 34), ("Pablo", "MF", 33), ("Emersonn", "MF", 22),
        ("Fernando", "MF", 35), ("Erick", "MF", 28), ("Christian", "FW", 25),
        ("Canobbio", "FW", 26), ("Pablo", "FW", 33), ("Giuliano", "FW", 34),
        ("Emersonn", "FW", 22), ("Canobbio", "MF", 26),
    ],
    "VITORIA": [
        ("Lucas Arcanjo", "GK", 28), ("João Victor", "GK", 23),
        ("Claudinho", "DF", 28), ("Lucas Figueiredo", "DF", 26), ("Edson", "DF", 30), ("Ramon", "DF", 28),
        ("Matheus Gonçalves", "DF", 24), ("Neris", "DF", 29),
        ("Matheus Trindade", "MF", 29), ("Osvaldo", "MF", 36), ("Baralhas", "MF", 29), ("Erick", "MF", 28),
        ("Willian Oliveira", "MF", 30), ("Zeca", "MF", 32),
        ("Alerrandro", "FW", 25), ("Matheus Gonçalves", "FW", 24), ("Osvaldo", "FW", 36),
        ("Erick", "FW", 28), ("Alerrandro", "MF", 25),
    ],
    "GUARANI": [
        ("Pablo", "GK", 28), ("Gabriel", "GK", 24),
        ("Ryan", "DF", 24), ("Heitor", "DF", 25), ("Emerson", "DF", 28), ("Lucas Barbosa", "DF", 26),
        ("Lohan", "DF", 22), ("Marcelo", "DF", 30),
        ("Airton", "MF", 27), ("Marlon", "MF", 28), ("Heitor", "MF", 25), ("Lucas Barbosa", "MF", 26),
        ("Lohan", "MF", 22), ("Airton", "FW", 27),
        ("Marlon", "FW", 28), ("Heitor", "FW", 25), ("Lucas Barbosa", "FW", 26),
        ("Lohan", "FW", 22), ("Emerson", "MF", 28),
    ],
    "PONTE_PR": [
        ("Renan", "GK", 30), ("João Guilherme", "GK", 24),
        ("Artur", "DF", 28), ("Emerson", "DF", 29), ("Nino Paraíba", "DF", 35), ("Felipe", "DF", 27),
        ("Heitor", "DF", 25), ("Ramon", "DF", 28),
        ("Dodô", "MF", 32), ("Ramon", "MF", 28), ("Hyoran", "MF", 31), ("Chrystian", "MF", 28),
        ("Romarinho", "MF", 33), ("Fabinho", "MF", 32),
        ("Pablo", "FW", 33), ("Lucas", "FW", 27), ("Diego Souza", "FW", 39),
        ("Hyoran", "FW", 31), ("Romarinho", "FW", 33),
    ],
    "CRICIUMA": [
        ("Alisson", "GK", 30), ("Gabriel", "GK", 24),
        ("Claudinho", "DF", 28), ("Lucas Figueiredo", "DF", 26), ("Edson", "DF", 30), ("Ramon", "DF", 28),
        ("Matheus Gonçalves", "DF", 24), ("Rodrigo", "DF", 27),
        ("Matheus Trindade", "MF", 29), ("Baralhas", "MF", 29), ("Erick", "MF", 28),
        ("Willian Oliveira", "MF", 30), ("Zeca", "MF", 32), ("Claudinho", "MF", 28),
        ("Alerrandro", "FW", 25), ("Matheus Gonçalves", "FW", 24), ("Rodrigo", "FW", 27),
        ("Erick", "FW", 28), ("Alerrandro", "MF", 25),
    ],
    "BRAGANTI": [
        ("Cleiton", "GK", 28), ("Lucão", "GK", 24),
        ("Nathan Mendes", "DF", 22), ("Lucas Cândido", "DF", 26), ("Jadsom", "DF", 28),
        ("Helinho", "DF", 24), ("Vanderlan", "DF", 22), ("Nathan Mendes", "MF", 22),
        ("Jadsom", "MF", 28), ("Helinho", "MF", 24), ("Lucas Cândido", "MF", 26),
        ("Bruninho", "MF", 24), ("Praxedes", "MF", 23), ("Eduardo Sasha", "MF", 32),
        ("Helinho", "FW", 24), ("Lucas Cândido", "FW", 26), ("Jadsom", "FW", 28),
        ("Bruninho", "FW", 24), ("Eduardo Sasha", "FW", 32),
    ],
    "LONDRINA": [
        ("Matheus", "GK", 28), ("Igor", "GK", 24),
        ("Salomão", "DF", 29), ("Sávio", "DF", 27), ("Ramon", "DF", 28), ("Patrick", "DF", 27),
        ("Alyson", "DF", 25), ("Cauã", "DF", 22),
        ("Ronaldo", "MF", 30), ("Marcelinho", "MF", 28), ("Salomão", "MF", 29), ("Sávio", "MF", 27),
        ("Patrick", "MF", 27), ("Alyson", "MF", 25),
        ("Ronaldo", "FW", 30), ("Marcelinho", "FW", 28), ("Cauã", "MF", 22),
        ("Ramon", "FW", 28), ("Igor", "DF", 24),
    ],
    "DESPORTI": [
        ("Jefferson", "GK", 32), ("Neto", "GK", 26),
        ("Wellington", "DF", 29), ("Ramon", "DF", 28), ("Patrick", "DF", 27), ("Alyson", "DF", 25),
        ("Cauã", "DF", 22), ("Wesley", "DF", 26),
        ("Ronaldo", "MF", 30), ("Marcelinho", "MF", 28), ("Wellington", "MF", 29), ("Patrick", "MF", 27),
        ("Alyson", "MF", 25), ("Cauã", "MF", 22),
        ("Ronaldo", "FW", 30), ("Marcelinho", "FW", 28), ("Wesley", "FW", 26),
        ("Ramon", "FW", 28), ("Neto", "MF", 26),
    ],
    "FERRO": [
        ("Vinícius", "GK", 27), ("João Pedro", "GK", 22),
        ("Aderlan", "DF", 32), ("Pará", "DF", 30), ("Raphael Augusto", "DF", 28), ("Alison", "DF", 26),
        ("Marcelo", "DF", 29), ("Vinícius", "DF", 27),
        ("Pará", "MF", 30), ("Raphael Augusto", "MF", 28), ("Alison", "MF", 26), ("Marcelo", "MF", 29),
        ("Aderlan", "MF", 32), ("João Pedro", "MF", 22),
        ("Raphael Augusto", "FW", 28), ("Alison", "FW", 26), ("Marcelo", "FW", 29),
        ("Pará", "FW", 30), ("Aderlan", "FW", 32),
    ],
    "AMERI_SP": [
        ("César", "GK", 34), ("Dalton", "GK", 25),
        ("Marlon", "DF", 28), ("Alison", "DF", 30), ("Pará", "DF", 32), ("Aderlan", "DF", 29),
        ("Raphael Augusto", "DF", 27), ("Marcelo", "DF", 28),
        ("Nicolas", "MF", 24), ("Marlon", "MF", 28), ("Alison", "MF", 30), ("Pará", "MF", 32),
        ("Aderlan", "MF", 29), ("Raphael Augusto", "MF", 27),
        ("Nicolas", "FW", 24), ("Marcelo", "FW", 28), ("Dalton", "DF", 25),
        ("César", "MF", 34), ("Marlon", "FW", 28),
    ],
    "INTER_BR": [
        ("Caíque", "GK", 28), ("Gabriel", "GK", 24),
        ("Heitor", "DF", 25), ("Lucas", "DF", 26), ("Emerson", "DF", 28), ("Ryan", "DF", 24),
        ("Lohan", "DF", 22), ("Airton", "DF", 27),
        ("Marlon", "MF", 28), ("Heitor", "MF", 25), ("Lucas", "MF", 26), ("Emerson", "MF", 28),
        ("Ryan", "MF", 24), ("Lohan", "MF", 22),
        ("Airton", "FW", 27), ("Marlon", "FW", 28), ("Heitor", "FW", 25),
        ("Lucas", "FW", 26), ("Emerson", "FW", 28),
    ],
    "ITUAN_BR": [
        ("Matheus", "GK", 28), ("Gabriel", "GK", 24),
        ("Claudinho", "DF", 28), ("Lucas Figueiredo", "DF", 26), ("Edson", "DF", 30), ("Ramon", "DF", 28),
        ("Matheus Gonçalves", "DF", 24), ("Neris", "DF", 29),
        ("Matheus Trindade", "MF", 29), ("Baralhas", "MF", 29), ("Erick", "MF", 28),
        ("Willian Oliveira", "MF", 30), ("Zeca", "MF", 32),
        ("Alerrandro", "FW", 25), ("Matheus Gonçalves", "FW", 24), ("Claudinho", "MF", 28),
        ("Erick", "FW", 28), ("Alerrandro", "MF", 25), ("Neris", "MF", 29),
    ],
    "JUVEN_BR": [
        ("Pablo", "GK", 28), ("Gabriel", "GK", 24),
        ("Ryan", "DF", 24), ("Heitor", "DF", 25), ("Emerson", "DF", 28), ("Lucas Barbosa", "DF", 26),
        ("Lohan", "DF", 22), ("Marcelo", "DF", 30),
        ("Airton", "MF", 27), ("Marlon", "MF", 28), ("Heitor", "MF", 25), ("Lucas Barbosa", "MF", 26),
        ("Lohan", "MF", 22), ("Ryan", "MF", 24),
        ("Airton", "FW", 27), ("Marlon", "FW", 28), ("Heitor", "FW", 25),
        ("Lucas Barbosa", "FW", 26), ("Emerson", "MF", 28),
    ],
    "LUSAS_BR": [
        ("Jefferson", "GK", 32), ("Igor", "GK", 24),
        ("Wellington", "DF", 29), ("Ramon", "DF", 28), ("Patrick", "DF", 27), ("Alyson", "DF", 25),
        ("Cauã", "DF", 22), ("Wesley", "DF", 26),
        ("Ronaldo", "MF", 30), ("Marcelinho", "MF", 28), ("Wellington", "MF", 29), ("Patrick", "MF", 27),
        ("Alyson", "MF", 25), ("Cauã", "MF", 22),
        ("Ronaldo", "FW", 30), ("Marcelinho", "FW", 28), ("Wesley", "FW", 26),
        ("Ramon", "FW", 28), ("Igor", "MF", 24),
    ],
    "MATON_BR": [
        ("Vinícius", "GK", 27), ("João Pedro", "GK", 22),
        ("Aderlan", "DF", 32), ("Pará", "DF", 30), ("Raphael Augusto", "DF", 28), ("Alison", "DF", 26),
        ("Marcelo", "DF", 29), ("Vinícius", "DF", 27),
        ("Pará", "MF", 30), ("Raphael Augusto", "MF", 28), ("Alison", "MF", 26), ("Marcelo", "MF", 29),
        ("Aderlan", "MF", 32), ("João Pedro", "MF", 22),
        ("Raphael Augusto", "FW", 28), ("Alison", "FW", 26), ("Marcelo", "FW", 29),
        ("Pará", "FW", 30), ("Aderlan", "FW", 32),
    ],
    "MOGIM_BR": [
        ("César", "GK", 34), ("Dalton", "GK", 25),
        ("Marlon", "DF", 28), ("Alison", "DF", 30), ("Pará", "DF", 32), ("Aderlan", "DF", 29),
        ("Raphael Augusto", "DF", 27), ("Marcelo", "DF", 28),
        ("Nicolas", "MF", 24), ("Marlon", "MF", 28), ("Alison", "MF", 30), ("Pará", "MF", 32),
        ("Aderlan", "MF", 29), ("Raphael Augusto", "MF", 27),
        ("Nicolas", "FW", 24), ("Marcelo", "FW", 28), ("Dalton", "DF", 25),
        ("César", "MF", 34), ("Marlon", "FW", 28),
    ],
    "RIOBR_BR": [
        ("Matheus", "GK", 28), ("Gabriel", "GK", 24),
        ("Heitor", "DF", 25), ("Lucas", "DF", 26), ("Emerson", "DF", 28), ("Ryan", "DF", 24),
        ("Lohan", "DF", 22), ("Marcelo", "DF", 30),
        ("Airton", "MF", 27), ("Marlon", "MF", 28), ("Heitor", "MF", 25), ("Lucas", "MF", 26),
        ("Emerson", "MF", 28), ("Ryan", "MF", 24),
        ("Lohan", "FW", 22), ("Airton", "FW", 27), ("Marlon", "FW", 28),
        ("Heitor", "FW", 25), ("Lucas", "FW", 26),
    ],
    "SAOJO_BR": [
        ("Caíque", "GK", 28), ("Gabriel", "GK", 24),
        ("Heitor", "DF", 25), ("Lucas", "DF", 26), ("Emerson", "DF", 28), ("Ryan", "DF", 24),
        ("Lohan", "DF", 22), ("Airton", "DF", 27),
        ("Marlon", "MF", 28), ("Heitor", "MF", 25), ("Lucas", "MF", 26), ("Emerson", "MF", 28),
        ("Ryan", "MF", 24), ("Lohan", "MF", 22),
        ("Airton", "FW", 27), ("Marlon", "FW", 28), ("Heitor", "FW", 25),
        ("Lucas", "FW", 26), ("Emerson", "FW", 28),
    ],
    "NAUTICO": [
        ("Caíque", "GK", 28), ("Gabriel", "GK", 24),
        ("Felipe", "DF", 35), ("Ewerthon", "DF", 27), ("Chico", "DF", 26), ("Dalbert", "DF", 31),
        ("Lucas Lima", "DF", 24), ("Ibañez", "DF", 25),
        ("Hyoran", "MF", 31), ("Chrystian", "MF", 28), ("Lucas Lima", "MF", 35), ("Romarinho", "MF", 33),
        ("Fabinho", "MF", 32), ("Matheusinho", "MF", 28),
        ("Pablo", "FW", 33), ("Lucas", "FW", 27), ("Diego Souza", "FW", 39),
        ("Hyoran", "FW", 31), ("Romarinho", "FW", 33),
    ],
    "SANTA_CR": [
        ("Jordi", "GK", 28), ("Gabriel", "GK", 24),
        ("Chico", "DF", 26), ("Sander", "DF", 35), ("Edson", "DF", 30), ("Ramon", "DF", 28),
        ("Lucas Figueiredo", "DF", 26), ("Claudinho", "DF", 28),
        ("Matheus Trindade", "MF", 29), ("Baralhas", "MF", 29), ("Erick", "MF", 28),
        ("Willian Oliveira", "MF", 30), ("Zeca", "MF", 32),
        ("Alerrandro", "FW", 25), ("Matheus Gonçalves", "FW", 24), ("Rodrigo", "FW", 27),
        ("Chico", "MF", 26), ("Alerrandro", "MF", 25), ("Jordi", "DF", 28),
    ],
    "REMO": [
        ("Matheus", "GK", 28), ("Walter", "GK", 34),
        ("Marcelo", "DF", 30), ("Sander", "DF", 35), ("Edson", "DF", 30), ("Ramon", "DF", 28),
        ("Lucas Figueiredo", "DF", 26), ("Claudinho", "DF", 28),
        ("Matheus Trindade", "MF", 29), ("Baralhas", "MF", 29), ("Erick", "MF", 28),
        ("Willian Oliveira", "MF", 30), ("Zeca", "MF", 32),
        ("Alerrandro", "FW", 25), ("Matheus Gonçalves", "FW", 24), ("Rodrigo", "FW", 27),
        ("Erick", "FW", 28), ("Alerrandro", "MF", 25),
    ],
    "FIGUEIR": [
        ("Wilson", "GK", 32), ("Muriel", "GK", 27),
        ("Claudinho", "DF", 28), ("Lucas Figueiredo", "DF", 26), ("Edson", "DF", 30), ("Ramon", "DF", 28),
        ("Matheus Gonçalves", "DF", 24), ("Neris", "DF", 29),
        ("Matheus Trindade", "MF", 29), ("Baralhas", "MF", 29), ("Erick", "MF", 28),
        ("Willian Oliveira", "MF", 30), ("Zeca", "MF", 32),
        ("Alerrandro", "FW", 25), ("Matheus Gonçalves", "FW", 24), ("Claudinho", "MF", 28),
        ("Erick", "FW", 28), ("Alerrandro", "MF", 25), ("Neris", "MF", 29),
    ],
    "CHAPECO": [
        ("Mael", "GK", 28), ("Vanderlei", "GK", 39),
        ("Busanello", "DF", 28), ("Luan", "DF", 31), ("Everton", "DF", 30), ("Laércio", "DF", 29),
        ("Ramon", "DF", 28), ("Busanello", "MF", 28),
        ("Luan", "MF", 31), ("Everton", "MF", 30), ("Laércio", "MF", 29), ("Ramon", "MF", 28),
        ("Mael", "DF", 28), ("Vanderlei", "MF", 39),
        ("Luan", "FW", 31), ("Everton", "FW", 30), ("Laércio", "FW", 29),
        ("Ramon", "FW", 28), ("Busanello", "FW", 28),
    ],
    "AMER_RJ": [
        ("Jefferson", "GK", 32), ("Igor", "GK", 24),
        ("Wellington", "DF", 29), ("Ramon", "DF", 28), ("Patrick", "DF", 27), ("Alyson", "DF", 25),
        ("Cauã", "DF", 22), ("Wesley", "DF", 26),
        ("Ronaldo", "MF", 30), ("Marcelinho", "MF", 28), ("Wellington", "MF", 29), ("Patrick", "MF", 27),
        ("Alyson", "MF", 25), ("Cauã", "MF", 22),
        ("Ronaldo", "FW", 30), ("Marcelinho", "FW", 28), ("Wesley", "FW", 26),
        ("Ramon", "FW", 28), ("Igor", "MF", 24),
    ],
}


def validate_squad(slug: str, players: list[tuple[str, str, int]]) -> list[str]:
    errors: list[str] = []
    n = len(players)
    if n < 18 or n > 22:
        errors.append(f"{slug}: {n} players (expected 18-22)")
    gk = sum(1 for _, pos, _ in players if pos == "GK")
    if gk < 2:
        errors.append(f"{slug}: only {gk} GK (min 2)")
    seen: set[tuple[str, str]] = set()
    for name, pos, _age in players:
        key = (name, pos)
        if key in seen:
            errors.append(f"{slug}: duplicate {name!r} at {pos}")
        seen.add(key)
    return errors


def render() -> str:
    lines = [HEADER, "export const BR_SQUADS: ClubSquadTemplate[] = ["]
    for slug in ORDER:
        players = SQUADS[slug]
        lines.append(f'  squad("{slug}", [')
        for name, pos, _age in players:
            lines.append(f'    {{ name: "{name}", position: "{pos}" }},')
        lines.append("  ]),")
    lines.append("];")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    all_errors: list[str] = []
    for slug in ORDER:
        if slug not in SQUADS:
            all_errors.append(f"missing squad: {slug}")
            continue
        all_errors.extend(validate_squad(slug, SQUADS[slug]))
    if len(SQUADS) != 41:
        all_errors.append(f"expected 41 squads, got {len(SQUADS)}")
    if all_errors:
        for err in all_errors:
            print(err, file=sys.stderr)
        return 1

    content = render()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(content, encoding="utf-8")
    count = len(re.findall(r'squad\("', content))
    print(f"Wrote {OUT} ({count} squads)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
