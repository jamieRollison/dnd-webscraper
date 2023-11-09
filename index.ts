import { config } from "dotenv";
import { JSDOM } from "jsdom";
import { Client } from "@notionhq/client";
import fetch from "node-fetch";

config();

interface Spell {
  name: string;
  level: string;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  description: string;
  higherLevel?: string;
  classes: string[];
}

const notion = new Client({ auth: process.env.API_KEY });

const databaseId = process.env.DATABASE_ID || "";

const scrapeSpell = async (spell: string) => {
  try {
    const response = await fetch(
      `http://dnd5e.wikidot.com/spell:${spell}`
    ).catch((e) => {
      console.log(`Error fetching ${spell}`);
      throw e;
    });
    const text = await response.text();
    const dom = await new JSDOM(text);
    const res = dom.window.document.getElementById("page-content")?.textContent;
    const title = dom.window.document.getElementsByClassName(
      "page-title page-header"
    )[0].textContent;
    return title + "\n" + res?.trim();
  } catch (error) {
    console.log(error);
    return "Error";
  }
};

const formatSpell = (content: string) => {
  const name = content.split("\n")[0];
  if (name.includes("(UA)") || content.includes("Acquisitions Inc.")) {
    return null;
  }

  const rows = content.split("\n").slice(2);
  // console.log(rows);
  if (
    rows[0].includes("cantrip") ||
    rows[0].includes("1st") ||
    rows[0].includes("2nd") ||
    rows[0].includes("3rd") ||
    rows[0].includes("4th") ||
    rows[0].includes("5th")
  ) {
    return null;
  }
  try {
    const easyRows = rows.slice(1, 5).map((row) => {
      const [key, value] = row.split(":");
      return { key: toCamelCase(key), value: value.trim() };
    });
    const processedEasy = {
      ...easyRows.reduce((acc, cur) => ({ ...acc, [cur.key]: cur.value }), {}),
    } as {
      components: string;
      duration: string;
      range: string;
      castingTime: string;
    };

    const first = rows[0].split(" ");
    const hardRows = rows.slice(5);
    const higherLevel = hardRows[hardRows.length - 2].includes(
      "At Higher Levels."
    )
      ? hardRows[hardRows.length - 2].slice("At Higher Levels. ".length)
      : "";

    const classes = hardRows[hardRows.length - 1]
      .slice("Spell Lists. ".length)
      .split(",")
      .map((c) => c.trim())
      .map((c) => (c.includes("(Optional)") ? c.slice(0, -11) : c));

    const processedHard = {
      name: name,
      level:
        first[1] !== "cantrip" ? first[0].split("-")[0] + " Level" : "Cantrip",
      school:
        first[1] !== "cantrip"
          ? first[1][0].toUpperCase() + first[1].slice(1)
          : first[0],
      description: higherLevel
        ? hardRows.slice(0, -2).join("\n")
        : hardRows.slice(0, -1).join("\n"),
      higherLevel: higherLevel,
      classes: classes,
    };

    return {
      ...processedEasy,
      ...processedHard,
    } as Spell;
  } catch (error) {
    console.log(error);
    console.log(content.split("\n"));
  }
};

export const getSpell = async (id: string) => {
  try {
    const content = await scrapeSpell(id).catch((e) => {
      throw e;
    });
    const formatted = formatSpell(content);
    return formatted;
  } catch (error) {
    throw error;
  }
};

export const addSpell = async (spell: Spell) => {
  const { description } = spell;
  // split description into pieces with a max length of 2000
  const descriptionPieces = description.match(/.{1,2000}/g);
  // map each description piece to a notion block
  const descriptionBlocks = descriptionPieces?.map((piece) => ({
    object: "block" as "block",
    type: "paragraph" as "paragraph",
    paragraph: {
      rich_text: [
        {
          text: {
            content: piece,
          },
        },
      ],
    },
  }));
  try {
    const response = await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        title: {
          title: [
            {
              text: {
                content: spell.name,
              },
            },
          ],
        },
        Level: {
          type: "select",
          select: {
            name: spell.level,
          },
        },
        Classes: {
          type: "multi_select",
          multi_select: spell.classes.map((c) => ({ name: c })),
        },
        School: {
          type: "select",
          select: {
            name: spell.school,
          },
        },
      },
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                text: {
                  content: "Casting Time: ",
                },
                annotations: {
                  bold: true,
                },
              },
              {
                text: {
                  content: spell.castingTime,
                },
              },
            ],
          },
        },
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                text: {
                  content: "Range: ",
                },
                annotations: {
                  bold: true,
                },
              },
              {
                text: {
                  content: spell.range,
                },
              },
            ],
          },
        },
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                text: {
                  content: "Components: ",
                },
                annotations: {
                  bold: true,
                },
              },
              {
                text: {
                  content: spell.components,
                },
              },
            ],
          },
        },
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                text: {
                  content: "Duration: ",
                },
                annotations: {
                  bold: true,
                },
              },
              {
                text: {
                  content: spell.duration,
                },
              },
            ],
          },
        },
        ...descriptionBlocks!,
        spell.higherLevel
          ? {
              object: "block",
              type: "paragraph",
              paragraph: {
                rich_text: [
                  {
                    text: {
                      content: "At Higher Levels. ",
                    },
                    annotations: {
                      bold: true,
                      italic: true,
                    },
                  },
                  {
                    text: {
                      content: spell.higherLevel,
                    },
                  },
                ],
              },
            }
          : {
              object: "block",
              type: "paragraph",
              paragraph: {
                rich_text: [
                  {
                    text: {
                      content: "",
                    },
                  },
                ],
              },
            },
      ],
    });
  } catch (error: any) {
    console.error(`Error adding ${spell.name}`);
    console.error(error);
  }
};

const queryDB = async (title: string) => {
  const response = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: "title",
      title: {
        equals: title,
      },
    },
  });
  return response.results;
};

(async () => {
  fetch("http://dnd5e.wikidot.com/spells")
    .then(async (res) => {
      res.text().then(async (text) => {
        const dom = new JSDOM(text);
        const allspells =
          dom.window.document.getElementsByClassName("list-pages-box");
        const table = [...allspells].slice(0);
        for (let level of table) {
          const spells = level.getElementsByTagName("a");
          for (let spellpage of spells) {
            const id = spellpage.getAttribute("href")?.split(":")[1];
            if (id) {
              try {
                const spell = await getSpell(id);
                if (spell) {
                  const done = await queryDB(spell.name);
                  if (!done) {
                    console.log("adding", spell.name);
                    addSpell(spell);
                  }
                }
              } catch (error) {
                console.log(id, "failed");
              }
            }
          }
          console.log("done with level");
        }
      });
    })
    .catch((e) => console.log(e));
})();

// convert a string from camelCase to snake_case
export const toSnake = (str: string) => {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
};

export function toCamelCase(s: string) {
  return s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ")
    .map((p, i) =>
      i ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p.toLowerCase()
    )
    .join("");
}
