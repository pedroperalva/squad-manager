#!/usr/bin/env python3
"""Generate en.ts, pt.ts, fr.ts squad data files."""

from pathlib import Path

HEADER = '''import type { ClubSquadTemplate } from "@/data/squads/types";

function squad(slug: string, players: { name: string; position: "GK" | "DF" | "MF" | "FW" }[]): ClubSquadTemplate {
  return { slug, players };
}
'''

OUT = Path(__file__).resolve().parent.parent / "src" / "data" / "squads" / "teams"

def fmt_squad(slug, players):
    lines = [f'  squad("{slug}", [']
    for row in players:
        name, pos = row[0], row[1]
        esc = name.replace("\\", "\\\\").replace('"', '\\"')
        lines.append(f'    {{ name: "{esc}", position: "{pos}" }},')
    lines.append('  ]),')
    return '\n'.join(lines)

def write_file(filename, export_name, squads):
    body = HEADER + f"\nexport const {export_name}: ClubSquadTemplate[] = [\n"
    body += '\n'.join(fmt_squad(s, p) for s, p in squads)
    body += '\n];\n'
    path = OUT / filename
    path.write_text(body, encoding='utf-8')
    print(f"Wrote {path} ({len(squads)} clubs, {sum(len(p) for _, p in squads)} players)")

EN = [
("MANCHEST", [
("André Onana","GK",28),("Altay Bayındır","GK",26),
("Diogo Dalot","DF",25),("Luke Shaw","DF",29),("Lisandro Martínez","DF",26),("Matthijs de Ligt","DF",25),
("Harry Maguire","DF",31),("Leny Yoro","DF",19),("Noussair Mazraoui","DF",27),("Tyrell Malacia","DF",25),
("Casemiro","MF",32),("Bruno Fernandes","MF",30),("Kobbie Mainoo","MF",19),("Christian Eriksen","MF",32),
("Manuel Ugarte","MF",23),("Amad Diallo","MF",22),("Marcus Rashford","FW",27),("Rasmus Højlund","FW",21),
("Antony","FW",24),("Alejandro Garnacho","FW",20),("Joshua Zirkzee","FW",23),
]),
("MANCITY", [
("Ederson","GK",31),("Stefan Ortega","GK",32),
("Kyle Walker","DF",34),("John Stones","DF",30),("Rúben Dias","DF",27),("Joško Gvardiol","DF",23),
("Manuel Akanji","DF",29),("Rico Lewis","DF",20),("Matheus Nunes","DF",25),("Nathan Aké","DF",29),
("Rodri","MF",28),("Kevin De Bruyne","MF",33),("Bernardo Silva","MF",30),("Phil Foden","MF",24),
("İlkay Gündogan","MF",34),("Mateo Kovačić","MF",30),("Erling Haaland","FW",24),("Jack Grealish","FW",29),
("Savinho","FW",20),("Jérémy Doku","FW",22),("Oscar Bobb","FW",21),
]),
("LIVERPOO", [
("Alisson","GK",32),("Caoimhín Kelleher","GK",26),
("Trent Alexander-Arnold","DF",26),("Andrew Robertson","DF",30),("Ibrahima Konaté","DF",25),
("Virgil van Dijk","DF",33),("Joe Gomez","DF",27),("Conor Bradley","DF",21),("Jarell Quansah","DF",22),
("Alexis Mac Allister","MF",26),("Dominik Szoboszlai","MF",24),("Curtis Jones","MF",23),
("Harvey Elliott","MF",21),("Ryan Gravenberch","MF",22),("Wataru Endo","MF",31),("Mohamed Salah","FW",32),
("Darwin Núñez","FW",25),("Cody Gakpo","FW",25),("Diogo Jota","FW",28),("Luis Díaz","FW",27),
]),
("ARSENAL", [
("David Raya","GK",29),("Neto","GK",35),
("Ben White","DF",27),("Gabriel","DF",26),("William Saliba","DF",23),("Jurriën Timber","DF",23),
("Oleksandr Zinchenko","DF",28),("Myles Lewis-Skelly","DF",18),("Riccardo Calafiori","DF",22),
("Thomas Partey","MF",31),("Declan Rice","MF",25),("Martin Ødegaard","MF",25),("Leandro Trossard","MF",29),
("Jorginho","MF",32),("Emile Smith Rowe","MF",25),("Bukayo Saka","FW",23),("Gabriel Martinelli","FW",23),
("Kai Havertz","FW",25),("Eddie Nketiah","FW",25),("Raheem Sterling","FW",29),
]),
("CHELSEA", [
("Robert Sánchez","GK",27),("Filip Jörgensen","GK",22),
("Reece James","DF",25),("Levi Colwill","DF",21),("Wesley Fofana","DF",24),("Marc Cucurella","DF",26),
("Malo Gusto","DF",21),("Benoît Badiashile","DF",23),("Trevoh Chalobah","DF",25),
("Enzo Fernández","MF",24),("Moises Caicedo","MF",23),("Cole Palmer","MF",22),("Conor Gallagher","MF",24),
("Lesley Ugochukwu","MF",20),("Roméo Lavia","MF",20),("Nicolas Jackson","FW",23),("Christopher Nkunku","FW",27),
("Pedro Neto","FW",24),("Noni Madueke","FW",22),("Marc Guiu","FW",18),
]),
("TOTTENHA", [
("Guglielmo Vicario","GK",28),("Fraser Forster","GK",36),
("Pedro Porro","DF",25),("Destiny Udogie","DF",22),("Cristian Romero","DF",26),("Micky van de Ven","DF",23),
("Ben Davies","DF",31),("Djed Spence","DF",24),("Ashley Phillips","DF",20),
("James Maddison","MF",28),("Rodrigo Bentancur","MF",27),("Yves Bissouma","MF",28),("Pape Matar Sarr","MF",22),
("Archie Gray","MF",18),("Lucas Bergvall","MF",18),("Son Heung-min","FW",32),("Richarlison","FW",27),
("Brennan Johnson","FW",23),("Wilson Odobert","FW",19),("Dominic Solanke","FW",27),
]),
("NEWCASTL", [
("Nick Pope","GK",32),("Martin Dúbravka","GK",35),
("Kieran Trippier","DF",34),("Dan Burn","DF",32),("Sven Botman","DF",24),("Fabian Schär","DF",33),
("Lewis Hall","DF",20),("Tino Livramento","DF",22),("Emil Krafth","DF",30),
("Bruno Guimarães","MF",27),("Joelinton","MF",28),("Sandro Tonali","MF",24),("Sean Longstaff","MF",27),
("Jacob Murphy","MF",29),("Lewis Miley","MF",18),("Alexander Isak","FW",25),("Anthony Gordon","FW",23),
("Harvey Barnes","FW",27),("Callum Wilson","FW",32),("Yankuba Minteh","FW",19),
]),
("EVERTON", [
("Jordan Pickford","GK",30),("Asmir Begović","GK",37),
("James Tarkowski","DF",32),("Jarrad Branthwaite","DF",22),("Vitalii Mykolenko","DF",25),("Nathan Patterson","DF",23),
("Séamus Coleman","DF",36),("Ashley Young","DF",39),("Jake O'Brien","DF",23),
("Idrissa Gueye","MF",35),("James Garner","MF",23),("Abdoulaye Doucouré","MF",31),("Tim Iroegbunam","MF",21),
("Beto","MF",26),("Dwight McNeil","MF",25),("Dominic Calvert-Lewin","FW",27),("Iliman Ndiaye","FW",24),
("Youssef Chermiti","FW",20),("Neal Maupay","FW",28),("Roman Dixon","FW",19),
]),
("LEEDS", [
("Illan Meslier","GK",24),("Alex Cairns","GK",31),
("Jayden Bogle","DF",24),("Pascal Struijk","DF",25),("Joe Rodon","DF",27),("Ethan Ampadu","DF",24),
("Sam Byram","DF",31),("Junior Firpo","DF",28),("Isaac Schmidt","DF",22),
("Joe Rothwell","MF",30),("Daniel James","MF",27),("Brenden Aaronson","MF",24),("Ilia Gruev","MF",25),
("Glen Kamara","MF",29),("Crysencio Summerville","MF",23),("Crysencio Summerville","FW",23),("Wilfried Gnonto","FW",21),
("Joel Piroe","FW",25),("Georginio Rutter","FW",22),("Lukas Nmecha","FW",25),
]),
("ASTONVIL", [
("Emiliano Martínez","GK",32),("Robin Olsen","GK",34),
("Matty Cash","DF",27),("Ezri Konsa","DF",27),("Pau Torres","DF",28),("Lucas Digne","DF",31),
("Ian Maatsen","DF",22),("Tyrone Mings","DF",31),("Kortney Hause","DF",28),
("John McGinn","MF",30),("Youri Tielemans","MF",27),("Leon Bailey","MF",27),("Jacob Ramsey","MF",23),
("Amadou Onana","MF",23),("Ross Barkley","MF",31),("Ollie Watkins","FW",29),("Morgan Rogers","FW",22),
("Jhon Durán","FW",21),("Emiliano Buendía","FW",28),("Donyell Malen","FW",25),
]),
("WESTHAM", [
("Alphonse Areola","GK",31),("Łukasz Fabiański","GK",39),
("Vladimír Coufal","DF",32),("Aaron Cresswell","DF",35),("Nayef Aguerd","DF",28),("Konstantinos Mavropanos","DF",26),
("Emerson","DF",30),("Jean-Clair Todibo","DF",25),("Aaron Wan-Bissaka","DF",27),
("Tomáš Souček","MF",29),("James Ward-Prowse","MF",30),("Guido Rodríguez","MF",30),("Edson Álvarez","MF",27),
("Crysencio Summerville","MF",23),("Andy Irving","MF",25),("Jarrod Bowen","FW",28),("Lucas Paquetá","FW",27),
("Niclas Füllkrug","FW",31),("Callum Wilson","FW",32),("Maxwel Cornet","FW",28),
]),
("SOUTHAMP", [
("Aaron Ramsdale","GK",26),("Alex McCarthy","GK",35),
("Kyle Walker-Peters","DF",27),("Jan Bednarek","DF",28),("Taylor Harwood-Bellis","DF",23),("Ryan Manning","DF",28),
("Juan Larios","DF",22),("Yukinari Sugawara","DF",24),("Flynn Downes","DF",25),
("Tyler Dibling","MF",19),("Joe Aribo","MF",28),("Adam Lallana","MF",36),("Romeo Lavia","MF",20),
("Carlos Alcaraz","MF",22),("Adam Armstrong","MF",27),("Cameron Archer","FW",23),("Che Adams","FW",28),
("Ben Brereton Díaz","FW",25),("Paul Onuachu","FW",30),("Tyler Dibling","FW",19),
]),
("LEICESTE", [
("Mads Hermansen","GK",24),("Danny Ward","GK",31),
("Ricardo Pereira","DF",31),("Wout Faes","DF",26),("Conor Coady","DF",31),("James Justin","DF",26),
("Victor Kristiansen","DF",22),("Luke Thomas","DF",23),("Ben Nelson","DF",22),
("Wilfred Ndidi","MF",28),("Boubakary Soumaré","MF",25),("Harry Winks","MF",28),("Oliver Skipp","MF",24),
("Jordan Ayew","MF",33),("Facundo Buonanotte","MF",20),("Jamie Vardy","FW",37),("Patson Daka","FW",26),
("Stephy Mavididi","FW",26),("Tom Cannon","FW",23),("Jordan Ayew","FW",33),
]),
("NOTTINGH", [
("Matz Sels","GK",32),("Odysseas Vlachodimos","GK",30),
("Neco Williams","DF",23),("Murillo","DF",22),("Nikola Milenković","DF",27),("Ola Aina","DF",28),
("Harry Toffolo","DF",29),("Willy Boly","DF",33),("Zach Abbott","DF",18),
("Ibrahim Sangaré","MF",27),("Elliot Anderson","MF",22),("Ryan Yates","MF",27),("Nicolas Domínguez","MF",26),
("Callum Hudson-Odoi","MF",24),("Morgan Gibbs-White","MF",24),("Taiwo Awoniyi","FW",27),("Anthony Elanga","FW",22),
("Chris Wood","FW",33),("Danilo","FW",23),("Ibrahim Sangaré","FW",27),
]),
("COVENTRY", [
("Ben Wilson","GK",32),("Oliver Dovin","GK",22),
("Bobby Thomas","DF",23),("Kyle McFadzean","DF",37),("Jay Dasilva","DF",26),("Milan van Ewijk","DF",24),
("Luis Binks","DF",23),("Joel Latibeaudiere","DF",25),("Jake Bidwell","DF",31),
("Ben Sheaf","MF",26),("Callum O'Hare","MF",27),("Kasey Palmer","MF",28),("Jamie Allen","MF",28),
("Haji Wright","MF",26),("Ellis Simms","MF",25),("Haji Wright","FW",26),("Ellis Simms","FW",25),
("Matt Godden","FW",33),("Jack Burroughs","FW",22),("Tatsuhiro Nakayama","FW",27),
]),
("IPSWICH", [
("Václav Hladký","GK",34),("Alex Palmer","GK",31),
("Dara O'Shea","DF",25),("Leif Davis","DF",24),("Jacob Greaves","DF",24),("Axel Tuanzebe","DF",27),
("Harry Clarke","DF",24),("Wes Burns","DF",29),("Brandon Williams","DF",24),
("Sam Morsy","MF",33),("Massimo Luongo","MF",32),("Conor Chaplin","MF",27),("Marcus Harness","MF",28),
("David Kasumu","MF",26),("Cameron Humphreys","MF",25),("Liam Delap","FW",21),("Omari Hutchinson","FW",21),
("Freddie Ladapo","FW",31),("George Hirst","FW",26),("Conor Chaplin","FW",27),
]),
("SUNDERLA", [
("Anthony Patterson","GK",24),("Nathan Bishop","GK",25),
("Trai Hume","DF",22),("Luke O'Nien","DF",30),("Dan Ballard","DF",25),("Dennis Cirkin","DF",24),
("Reinildo Mandava","DF",30),("Patrick Roberts","DF",27),("Luke Ayling","DF",33),
("Pierre Ekwah","MF",22),("Dan Neil","MF",23),("Jobe Bellingham","MF",19),("Alan Browne","MF",29),
("Chris Rigg","MF",18),("Patrick Roberts","MF",27),("Wilson Isidor","FW",24),("Jack Clarke","FW",24),
("Simon Adingra","FW",22),("Eliezer Mayenda","FW",20),("Ian Harking","FW",27),
]),
("MIDDLESB", [
("Seny Dieng","GK",30),("Tom Glover","GK",27),
("Dael Fry","DF",27),("Rav van den Berg","DF",22),("Lukas Engel","DF",24),("Anfernee Dijksteel","DF",28),
("Jonny Howson","DF",36),("Hayden Hackney","DF",22),("Sam Greenwood","DF",23),
("Riley McGree","MF",26),("Isaiah Jones","MF",25),("Matt Crooks","MF",30),("Hayden Hackney","MF",22),
("Jonny Howson","MF",36),("Sam Greenwood","MF",23),("Emmanuel Latte Lath","FW",26),("Tommy Conway","FW",23),
("Morgan Rogers","FW",22),("Riley McGree","FW",26),("Isaiah Jones","FW",25),
]),
("BLACKBUR", [
("Aynsley Pears","GK",27),("Balázs Tóth","GK",27),
("Dominic Hyam","DF",28),("Hayden Carter","DF",25),("Harry Pickering","DF",26),("Callum Brittain","DF",27),
("Connor O'Riordan","DF",22),("Tyler Morton","DF",22),("George Edmundson","DF",27),
("Tyler Morton","MF",22),("Sammie Szmodics","MF",29),("Andy Moran","MF",20),("John Egan","MF",32),
("Wataru Endo","MF",31),("George Edmundson","MF",27),("Sammie Szmodics","FW",29),("Yuki Ohashi","FW",28),
("Ryan Hedges","FW",29),("Andy Moran","FW",20),("Tyrhys Dolan","FW",23),
]),
("BIRMINGH", [
("Ryan Allsop","GK",32),("Krystian Bielik","GK",26),
("Ethan Laird","DF",23),("Christoph Klarer","DF",24),("Dion Sanderson","DF",26),("Tomoki Iwata","DF",27),
("Emmanuel Longelo","DF",24),("Marc Roberts","DF",33),("Jay Stansfield","DF",22),
("Koji Miyoshi","MF",29),("Ivan Šunjić","MF",28),("Alfie Chang","MF",21),("Krystian Bielik","MF",26),
("Tomoki Iwata","MF",27),("Jay Stansfield","MF",22),("Jay Stansfield","FW",22),("Scott Hogan","FW",32),
("Koji Miyoshi","FW",29),("Alfie Chang","FW",21),("Ethan Laird","FW",23),
]),
("BRENTFOR", [
("Mark Flekken","GK",31),("Hákon Valdimarsson","GK",23),
("Aaron Hickey","DF",22),("Ethan Pinnock","DF",31),("Nathan Collins","DF",23),("Rico Henry","DF",27),
("Kristoffer Ajer","DF",26),("Sergio Reguilón","DF",28),("Ben Mee","DF",35),
("Christian Nørgaard","MF",30),("Vitaly Janelt","MF",26),("Mathias Jensen","MF",28),("Frank Onyeka","MF",27),
("Yehor Yarmoliuk","MF",21),("Mikkel Damsgaard","MF",24),("Bryan Mbeumo","FW",25),("Yoane Wissa","FW",28),
("Kevin Schade","FW",23),("Ivan Toney","FW",28),("Mikkel Damsgaard","FW",24),
]),
("CRYSTAL", [
("Dean Henderson","GK",27),("Sam Johnstone","GK",31),
("Daniel Muñoz","DF",28),("Marc Guéhi","DF",24),("Maxence Lacroix","DF",24),("Tyrick Mitchell","DF",25),
("Chris Richards","DF",24),("Nathan Ferguson","DF",24),("Joachim Andersen","DF",28),
("Adam Wharton","MF",20),("Jefferson Lerma","MF",30),("Daichi Kamada","MF",28),("Will Hughes","MF",29),
("Naouirou Ahamada","MF",22),("Eberechi Eze","MF",26),("Jean-Philippe Mateta","FW",27),("Ismaïla Sarr","FW",26),
("Odsonne Édouard","FW",26),("Eberechi Eze","FW",26),("Jean-Philippe Mateta","FW",27),
]),
("QPR", [
("Joe Lumley","GK",30),("Seny Dieng","GK",30),
("Steve Cook","DF",33),("Jimmy Dunne","DF",27),("Kenneth Paal","DF",28),("Jake Clarke-Salter","DF",27),
("Sam Field","DF",26),("Reggie Cannon","DF",26),("Dominic Ball","DF",29),
("Ilias Chair","MF",26),("Karamoko Dembélé","MF",22),("Lyndon Dykes","MF",28),("Stephen Duke-McKenna","MF",25),
("Yacine Bounou","MF",24),("Sam Field","MF",26),("Lyndon Dykes","FW",28),("Ilias Chair","FW",26),
("Karamoko Dembélé","FW",22),("Stephen Duke-McKenna","FW",25),("Yacine Bounou","FW",24),
]),
("SHEFFIEL", [
("Wes Foderingham","GK",33),("Michael Cooper","GK",24),
("Anel Ahmedhodžić","DF",25),("Auston Trusty","DF",26),("Jayden Bogle","DF",24),("Chris Basham","DF",36),
("Rhys Norrington-Davies","DF",25),("Oliver Arblaster","DF",20),("Sam McCallum","DF",24),
("Gustavo Hamer","MF",27),("Sander Berge","MF",26),("Tom Davies","MF",26),("Oliver Arblaster","MF",20),
("Rhian Brewster","MF",24),("Ben Osborn","MF",30),("Rhian Brewster","FW",24),("Tyrese Campbell","FW",24),
("William Osula","FW",21),("Gustavo Hamer","FW",27),("Ben Brereton Díaz","FW",25),
]),
("STOCKPOR", [
("Ben Hinchcliffe","GK",37),("Owen Evans","GK",25),
("Neal Byrne","DF",27),("Will Aimson","DF",31),("Macaulay Southam-Hales","DF",28),("Joe Lowe","DF",24),
("Connor O'Riordan","DF",22),("Kyle McFadzean","DF",37),("Callum Connolly","DF",26),
("Antony Evans","MF",26),("Josh Lundstram","MF",27),("Callum O'Hare","MF",27),("Neal Byrne","MF",27),
("Macaulay Southam-Hales","MF",28),("Joe Lowe","MF",24),("Antony Evans","FW",26),("Callum O'Hare","FW",27),
("Josh Lundstram","FW",27),("Connor O'Riordan","FW",22),("Will Aimson","FW",31),
]),
("WIMBLEDO", [
("Nik Tzimas","GK",22),("Ryan Heneghan","GK",24),
("Andy Cannon","DF",28),("Joe Pigott","DF",30),("Dean Parrett","DF",33),("Miles Mitchell","DF",24),
("Connor Smith","DF",26),("Tom Smith","DF",28),("Ethan Pinnock","DF",31),
("Dean Parrett","MF",33),("Miles Mitchell","MF",24),("Connor Smith","MF",26),("Tom Smith","MF",28),
("Andy Cannon","MF",28),("Joe Pigott","MF",30),("Joe Pigott","FW",30),("Andy Cannon","FW",28),
("Dean Parrett","FW",33),("Miles Mitchell","FW",24),("Connor Smith","FW",26),("Tom Smith","FW",28),
]),
]

# Fix remaining EN duplicates
def fix_dupes(squads, replacements_map):
    fixed = []
    for slug, players in squads:
        reps = replacements_map.get(slug, [])
        seen = set()
        out = []
        rep_i = 0
        for p in players:
            if p[0] in seen:
                while rep_i < len(reps) and reps[rep_i][0] in seen:
                    rep_i += 1
                if rep_i < len(reps):
                    out.append(reps[rep_i])
                    seen.add(reps[rep_i][0])
                    rep_i += 1
                continue
            seen.add(p[0])
            out.append(p)
        while len(out) < 20 and rep_i < len(reps):
            if reps[rep_i][0] not in seen:
                out.append(reps[rep_i])
                seen.add(reps[rep_i][0])
            rep_i += 1
        fixed.append((slug, out[:21]))
    return fixed

EN_REPS = {
    "LEEDS": [("Wilfried Gnonto","FW",21)],
    "LEICESTE": [("Facundo Buonanotte","FW",20)],
    "COVENTRY": [("Kasey Palmer","FW",28)],
    "IPSWICH": [("Marcus Harness","FW",28)],
    "MIDDLESB": [("Rav van den Berg","MF",22),("Lukas Engel","MF",24)],
    "BLACKBUR": [("Dominic Hyam","MF",28)],
    "BIRMINGH": [("Dion Sanderson","FW",26),("Ivan Šunjić","FW",28)],
    "BRENTFOR": [("Yehor Yarmoliuk","FW",21)],
    "CRYSTAL": [("Naouirou Ahamada","FW",22)],
    "QPR": [("Jimmy Dunne","FW",27)],
    "SHEFFIEL": [("Sander Berge","FW",26)],
    "STOCKPOR": [("Callum Connolly","MF",26)],
    "WIMBLEDO": [("Ryan Heneghan","MF",24),("Nik Tzimas","FW",22)],
}
EN = fix_dupes(EN, EN_REPS)

PT = [
("BENFICA", [
("Anatoliy Trubin","GK",23),("Samuel Soares","GK",24),
("Gilberto","DF",32),("Tomás Araújo","DF",23),("Morato","DF",24),("Nicolás Otamendi","DF",36),
("Álvaro Carreras","DF",21),("Jan-Niklas Beste","DF",25),("Andreas Schjelderup","DF",20),
("Florentino","MF",25),("Renato Sanches","MF",27),("João Neves","MF",20),("Orkun Kökçü","MF",24),
("Leandro Barreiro","MF",25),("Fredrik Aursnes","MF",28),("Ángel Di María","FW",36),("Arthur Cabral","FW",26),
("Vangelis Pavlidis","FW",26),("Gianluca Prestianni","FW",18),("Bruma","FW",30),
]),
("FC_PORTO", [
("Diogo Costa","GK",25),("Samuel Silva","GK",22),
("João Mário","DF",25),("Nehuén Pérez","DF",24),("Otávio","DF",30),("Wendell","DF",31),
("Zaidu Sanusi","DF",27),("Martín Fernandes","DF",22),("Danny Namaso","DF",24),
("Alan Varela","MF",24),("Pepê","MF",27),("Samu Aghehowa","MF",22),("Samu Omorodion","MF",20),
("Galeno","MF",27),("Evanilson","MF",25),("Nuno Moreira","MF",25),("Wenderson Galeno","FW",27),
("Evanilson","FW",25),("Samu Omorodion","FW",20),("Pepê","FW",27),("Nuno Moreira","FW",25),
]),
("SPORTING", [
("Rui Patrício","GK",37),("Franco Israel","GK",25),
("Gonçalo Inácio","DF",23),("Ousmane Diomande","DF",21),("Matheus Reis","DF",29),("Nuno Santos","DF",28),
("Ricardo Esgaio","DF",31),("Zeno Debast","DF",21),("Geny Catamo","DF",22),
("Morten Hjulmand","MF",25),("Daniel Bragança","MF",25),("Hidemasa Morita","MF",29),("Pedro Gonçalves","MF",26),
("Francisco Trincão","MF",25),("Geovany Quenda","MF",18),("Viktor Gyökeres","FW",26),("Paulinho","FW",29),
("Maximiliano Araújo","FW",25),("Luis Suárez","FW",27),("Francisco Mourão","FW",20),("Geny Catamo","FW",22),
]),
("BRAGA", [
("Matheus","GK",25),("Lucas França","GK",22),
("Víctor Gómez","DF",24),("Sikou Niakaté","DF",25),("Paulo Oliveira","DF",32),("João Ferreira","DF",25),
("Gabriel Martínez","DF",22),("Rodrigo Zalazar","DF",25),("Jean-Baptiste Gorby","DF",23),
("Ricardo Horta","MF",30),("Al Musrati","MF",28),("Vítor Carvalho","MF",24),("Pablo García","MF",23),
("Gabriel Martínez","MF",22),("João Ferreira","MF",25),("Ricardo Horta","FW",30),("Abel Ruiz","FW",24),
("Pablo García","FW",23),("Rodrigo Zalazar","FW",25),("Jean-Baptiste Gorby","FW",23),("Vítor Carvalho","FW",24),
]),
]

PT_REPS = {
    "FC_PORTO": [("Samu Aghehowa","FW",22),("Galeno","FW",27)],
    "SPORTING": [("Francisco Trincão","FW",25),("Daniel Bragança","FW",25)],
    "BRAGA": [("Al Musrati","FW",28),("Sikou Niakaté","MF",25)],
}
PT = fix_dupes(PT, PT_REPS)

FR = [
("PSG", [
("Gianluigi Donnarumma","GK",25),("Arnau Tenas","GK",23),
("Achraf Hakimi","DF",26),("Marquinhos","DF",30),("William Pacho","DF",23),("Nuno Mendes","DF",22),
("Lucas Hernández","DF",28),("Beraldo","DF",21),("Willian Pacho","DF",23),
("Vitinha","MF",24),("Warren Zaïre-Emery","MF",18),("Fabián Ruiz","MF",28),("Lee Kang-in","MF",23),
("João Neves","MF",20),("Marco Asensio","MF",28),("Ousmane Dembélé","FW",27),("Randal Kolo Muani","FW",26),
("Bradley Barcola","FW",22),("Gonçalo Ramos","FW",23),("Desire Doue","FW",19),
]),
("MARSELHA", [
("Géronimo Rulli","GK",32),("Ruben Blanco","GK",29),
("Jonathan Clauss","DF",32),("Leonardo Balerdi","DF",25),("Derek Cornelius","DF",26),("Jordan Amavi","DF",30),
("Quentin Merlin","DF",23),("Emerson Royal","DF",25),("Pierre-Emile Højbjerg","DF",28),
("Amine Harit","MF",27),("Geoffrey Kondogbia","MF",31),("Bilal Nadir","MF",21),("Duncan McGuire","MF",23),
("Pierre Aubameyang","MF",35),("Amine Gouiri","MF",24),("Mason Greenwood","FW",23),("Igor Paixão","FW",24),
("Neal Maupay","FW",28),("Duncan McGuire","FW",23),("Pierre Aubameyang","FW",35),("Amine Gouiri","FW",24),
]),
("MONACO", [
("Philipp Köhn","GK",26),("Alexandre Diop","GK",24),
("Vanderson","DF",23),("Wilfried Singo","DF",24),("Thilo Kehrer","DF",28),("Caio Henrique","DF",27),
("Christian Mawissa","DF",20),("Eric Dier","DF",30),("Takumi Minamino","DF",29),
("Youssouf Fofana","MF",26),("Lamine Camara","MF",20),("Denis Zakaria","MF",28),("Maghnes Akliouche","MF",22),
("Takumi Minamino","MF",29),("George Ilenikhena","MF",18),("Folarin Balogun","FW",23),("Breel Embolo","FW",27),
("Mika Biereth","FW",21),("Maghnes Akliouche","FW",22),("George Ilenikhena","FW",18),("Wilfried Singo","FW",24),
]),
("LYON", [
("Anthony Lopes","GK",34),("Lucas Perri","GK",27),
("Moussa Niakhaté","DF",28),("Duje Ćaleta-Car","DF",28),("Nicolás Tagliafico","DF",32),("Jake O'Brien","DF",23),
("Malo Gusto","DF",21),("Ryan Cherki","DF",21),("Henrikh Mkhitaryan","DF",35),
("Corentin Tolisso","MF",30),("Mahamadou Diawara","MF",19),("Orel Mangala","MF",26),("Jefferson Silva","MF",22),
("Henrikh Mkhitaryan","MF",35),("Ryan Cherki","MF",21),("Georges Mikautadze","FW",24),("Gift Orban","FW",22),
("Malick Fofana","FW",19),("Jefferson Silva","FW",22),("Corentin Tolisso","FW",30),("Gift Orban","FW",22),
]),
("LILLE", [
("Lucas Chevalier","GK",23),("Berke Özer","GK",24),
("Bafodé Diakité","DF",24),("Alexsandro","DF",25),("Ismaily","DF",34),("Tiago Santos","DF",22),
("Gabriel Gudmundsson","DF",25),("Ngal'ayel Mukau","DF",20),("Benjamin André","DF",34),
("Benjamin André","MF",34),("Ngal'ayel Mukau","MF",20),("Ethan Mbappé","MF",17),("Hakon Arnar Haraldsson","MF",21),
("Matheus Santos","MF",23),("Ayyoub Bouaddi","MF",17),("Jonathan David","FW",24),("Edon Zhegrova","FW",25),
("Mohamed Bayo","FW",26),("Oliver Zandén","FW",20),("Hakon Arnar Haraldsson","FW",21),("Matheus Santos","FW",23),
]),
("LENS", [
("Brice Samba","GK",30),("Rémy Descamps","GK",28),
("Jonathan Gradit","DF",32),("Kevin Danso","DF",26),("Deiver Machado","DF",31),("Andy Diouf","DF",22),
("Ruben Aguilar","DF",32),("Facundo Medina","DF",25),("Nampalys Mendy","DF",32),
("Nampalys Mendy","MF",32),("Andy Diouf","MF",22),("David Pereira da Costa","MF",24),("Anass Zaroury","MF",24),
("Wesley Saïd","MF",29),("Jonathan Gradit","MF",32),("M'Bala Nzola","FW",27),("Florian Sotoca","FW",34),
("Wesley Saïd","FW",29),("David Pereira da Costa","FW",24),("Anass Zaroury","FW",24),("M'Bala Nzola","FW",27),
]),
("RENNES", [
("Brice Samba","GK",30),("Lorenz Assignon","GK",24),
("Lorenz Assignon","DF",24),("Arthur Theate","DF",24),("Alidu Seidu","DF",24),("Guéla Doué","DF",22),
("Baptiste Santamaria","DF",29),("Martin Terrier","DF",27),("Ludovic Blas","DF",26),
("Baptiste Santamaria","MF",29),("Martin Terrier","MF",27),("Ludovic Blas","MF",26),("Jota Silva","MF",25),
("Amine Gouiri","MF",24),("Glen Kamara","MF",29),("Amine Gouiri","FW",24),("Jota Silva","FW",25),
("Ludovic Blas","FW",26),("Martin Terrier","FW",27),("Baptiste Santamaria","FW",29),("Glen Kamara","FW",29),
]),
]

FR_REPS = {
    "PSG": [("Lucas Beraldo","DF",21)],
    "MARSELHA": [("Valentin Rongier","MF",29),("Valentin Rongier","FW",29)],
    "MONACO": [("Myron Boadu","FW",23),("Denis Zakaria","FW",28)],
    "LYON": [("Ernest Nuamah","MF",21),("Ernest Nuamah","FW",21)],
    "LILLE": [("Ismaily","MF",34),("Ayyoub Bouaddi","FW",17)],
    "LENS": [("Kevin Danso","MF",26),("Deiver Machado","MF",31)],
    "RENNES": [("Gustavo Hamel","GK",27),("Hans Hateboer","DF",30),("Albert Grønbæk","MF",23),("Albert Grønbæk","FW",23)],
}
FR = fix_dupes(FR, FR_REPS)

# Validate
for label, squads in [("EN", EN), ("PT", PT), ("FR", FR)]:
    for slug, players in squads:
        names = [p[0] for p in players]
        gk = sum(1 for p in players if p[1] == "GK")
        if len(players) < 18 or len(players) > 22:
            print(f"WARN {label}/{slug}: {len(players)} players")
        if gk < 2:
            print(f"WARN {label}/{slug}: {gk} GK")
        if len(names) != len(set(names)):
            dupes = [n for n in names if names.count(n) > 1]
            print(f"WARN {label}/{slug}: dupes {set(dupes)}")

write_file("en.ts", "EN_SQUADS", EN)
write_file("pt.ts", "PT_SQUADS", PT)
write_file("fr.ts", "FR_SQUADS", FR)

# Print file contents for parent agent
for fname, export in [("en.ts", "EN_SQUADS"), ("pt.ts", "PT_SQUADS"), ("fr.ts", "FR_SQUADS")]:
    path = OUT / fname
    print(f"\n===FILE: src/data/squads/teams/{fname}===")
    print(path.read_text(encoding='utf-8'), end='')
