export interface HTMLCreatorConfig {
    excludeHTMLtag?: boolean;
    htmlTagAttributes?: HTMLCreatorElement["attributes"];
}

export interface HTMLCreatorElement {
    type?: string;
    attributes?: { [key: string]: string };
    content?: string | HTMLCreatorElement[];
}

export const searchForElement = ({
    stack,
    type,
    id,
    className,
  }: {
    stack: HTMLCreatorElement["content"];
    type?: HTMLCreatorElement["type"];
    id?: string;
    className?: string;
  }): HTMLCreatorElement[] => {
    const result = [];
  
    if (stack && Array.isArray(stack)) {
      // Look for matches and push to the result
      result.push(
        stack.filter((element) => {
          if (type) {
            return element.type === type;
          }
          if (id) {
            return element.attributes && element.attributes.id === id;
          }
          if (className) {
            return element.attributes && element.attributes.class === className;
          }
          return null;
        })
      );
      // Loop through the content of the element and look for matches
      stack.forEach((element) => {
        if (element.content && element.content.constructor === Array) {
          const deepSearch = searchForElement({
            stack: element.content,
            type,
            id,
            className,
          });
          if (deepSearch) {
            result.push(deepSearch);
          }
        }
      });
    }
    // Flatten result array or just return a single object
    const flatResult = result.flat();
    if (flatResult.length > 0) {
      if (flatResult.length === 1) {
        return [flatResult[0]];
      }
      return flatResult;
    }
    return [];
  };

export const pushOrConcat = (
    targetArray: HTMLCreatorElement[],
    input: HTMLCreatorElement | HTMLCreatorElement[]
) => {
    if (Array.isArray(input)) {
        return targetArray.concat(input);
    }
    targetArray.push(input);
    return targetArray;
};
const VoidElements = [
    "area",
    "base",
    "br",
    "col",
    "command",
    "embed",
    "hr",
    "img",
    "input",
    "keygen",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
];

/**
 * Returns a string with the props as HTML attributes
 * @param {Object} props
 */
export const applyElementAttributes = (
    attributes: HTMLCreatorElement["attributes"]
) => {
    if (attributes) {
        return Object.keys(attributes)
            .map(
                (key) =>
                    ` ${key.replace(/([A-Z])/g, (g) => `-${g[0].toLowerCase()}`)}="${attributes[key]
                    }"`
            )
            .join("");
    }
    return "";
};

/**
 * Parses given content. If the content is an array, recursive parsing will be performed
 * @param {String/Array} content
 * @param {Function} createElementMethod
 */
export const parseElementContent = (
    content?: HTMLCreatorElement["content"]
) => {
    if (content && content.constructor === Array) {
        return content.map((element) => generateElement(element)).join("");
    }
    return content || "";
};

/**
 * Generates a HTML element from the given data
 * @param {String} type - The HTML Tag type
 * @param {Object} applyAttributes - The HTML attributes to be added to the tag
 * @param {String/Array} content - The content of the tag. Can be either a string or an array of elements
 */
export const generateElement = (element: HTMLCreatorElement): string => {
    if (element.type) {
        if (VoidElements.includes(element.type)) {
            return `<${element.type}${applyElementAttributes(element.attributes)} />`;
        }
        return `<${element.type}${applyElementAttributes(
            element.attributes
        )}>${parseElementContent(element.content)}</${element.type}>`;
    }
    return typeof element.content === "string" ||
        element.content instanceof String
        ? (element.content as string)
        : "";
};

class HTMLCreatorDocument {
    content: HTMLCreatorElement[];

    constructor(content?: HTMLCreatorElement[]) {
        this.content = content && Array.isArray(content) ? content : [];
    }

    // Parses the content and returns the elements in HTML
    renderContent() {
        let output = "";
        if (this.content) {
            this.content.forEach((element) => {
                output += `${generateElement(element)}`;
            });
        }
        return output;
    }

    // Returns the content in HTML as a string
    getHTML(options?: HTMLCreatorConfig) {
        const html = `<!DOCTYPE html>${generateElement({
            type: "html",
            content: this.renderContent(),
            attributes: options?.htmlTagAttributes,
        })}`;
        return html.replace(/(\r\n|\n|\r)/gm, "");
    }

    /**
     * Helper function to set the title of the document
     * @param {String} newTitle
     */
    setTitle(newTitle: string) {
        // Begin by searching for an existing title tag
        const titleTag = this.findElementByType("title")[0];
        if (titleTag) {
            titleTag.content = newTitle;
            return newTitle;
        }
        // Next search for an existing head tag
        const headTag = this.findElementByType("head")[0];
        if (headTag) {
            if (headTag.content && headTag.content.constructor === Array) {
                headTag.content.push({
                    type: "title",
                    content: newTitle,
                });
            } else {
                headTag.content = [
                    {
                        type: "title",
                        content: newTitle,
                    },
                ];
            }
            return newTitle;
        }
        // If we passed to this point, we simply add a new head tag and a title tag
        this.content.push({
            type: "head",
            content: [
                {
                    type: "title",
                    content: newTitle,
                },
            ],
        });
        return this;
    }

    /**
     * Adds element data to the content. This method is chainable.
     * @param {Object} elementData
     */
    addElement(element: HTMLCreatorElement | HTMLCreatorElement[]) {
        this.content = pushOrConcat(this.content, element);
        return this;
    }

    /**
     * Adds element data to the specified target (id, class or type). This method is chainable.
     */
    addElementToTarget(
        element: HTMLCreatorElement,
        search: { id?: string; class?: string; type?: string }
    ) {
        let targetElementList: HTMLCreatorElement[] = [];

        // Look up the target element
        if (search) {
            if (search.id) {
                targetElementList = this.findElementById(search.id);
            } else if (search.class) {
                targetElementList = this.findElementByClassName(search.class);
            } else if (search.type) {
                targetElementList = this.findElementByType(search.type);
            }
        }

        if (targetElementList.length > 0) {
            targetElementList.map((targetElement) => {
                if (!targetElement.content) {
                    targetElement.content = [element];
                    return;
                }

                if (Array.isArray(targetElement.content)) {
                    targetElement.content.push(element);
                    return;
                }

                if (
                    typeof targetElement.content === "string" ||
                    targetElement.constructor === String
                ) {
                    targetElement.content = [
                        {
                            content: targetElement.content,
                        },
                        element,
                    ];
                }
            });
        }

        return this;
    }

    /**
     * Adds element data to given class name
     * @param {String} className
     * @param {Object} elementData
     */
    addElementToClass(className: string, element: HTMLCreatorElement) {
        return this.addElementToTarget(element, { class: className });
    }

    /**
     * Adds element data to given ID
     * @param {String} className
     * @param {Object} elementData
     */
    addElementToId(id: string, element: HTMLCreatorElement) {
        return this.addElementToTarget(element, { id });
    }

    /**
     * Adds element data to given type
     * @param {String} className
     * @param {Object} elementData
     */
    addElementToType(
        type: HTMLCreatorElement["type"],
        element: HTMLCreatorElement
    ) {
        return this.addElementToTarget(element, { type });
    }

    /**
     * Finds and returns an element by type.
     * Returns null if not found.
     * @param {String} needle
     */
    findElementByType(needle: HTMLCreatorElement["type"]) {
        return searchForElement({ stack: this.content, type: needle });
    }
    /**
     * Finds and returns an element by ID.
     * Returns null if not found.
     * @param {String} needle
     */
    findElementById(needle: string) {
        return searchForElement({ stack: this.content, id: needle });
    }
    /**
     * Finds and returns an element by class.
     * Returns null if not found.
     * @param {String} needle
     */
    findElementByClassName(needle: string) {
        return searchForElement({ stack: this.content, className: needle });
    }

    /**
     * Helper function that sets a simple boilerplate content
     * @param {Array} content
     */
    withBoilerplate() {
        this.content = [
            {
                type: "head",
                content: [
                    { type: "meta", attributes: { charset: "utf-8" } },
                    {
                        type: "meta",
                        attributes: {
                            name: "viewport",
                            content: "width=device-width, initial-scale=1, shrink-to-fit=no",
                        },
                    },
                ],
            },
            {
                type: "body",
                content: this.content,
            },
        ];
        return this;
    }
}

export default HTMLCreatorDocument;