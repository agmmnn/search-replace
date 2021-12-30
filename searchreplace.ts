'use strict';

const ELEMENT_FILTER = new RegExp('(HTML|HEAD|SCRIPT|BODY|STYLE|IFRAME)');
const INPUT_TEXTAREA_FILTER = new RegExp('(INPUT|TEXTAREA)')


function regExEscape(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

function replaceInInnerHTML(element, searchPattern, replaceTerm) {
    const searchStr = element.innerHTML;
    element.innerHTML = searchStr.replace(searchPattern, replaceTerm);
    return !(element.innerHTML === searchStr)

}


function replaceInInput(input, searchPattern, replaceTerm, usesKnockout): boolean {
    if (input.value === undefined) {
        return false
    }

    const oldValue = input.value;
    const newValue = input.value.replace(searchPattern, replaceTerm);

    if (oldValue === newValue) {
        return false
    }

    input.focus();
    input.value = newValue

    if (usesKnockout) {
        const knockoutValueChanger = getKnockoutValueChanger(input.id, newValue);
        document.documentElement.setAttribute('onreset', knockoutValueChanger);
        document.documentElement.dispatchEvent(new CustomEvent('reset'));
        document.documentElement.removeAttribute('onreset');
    }

    input.blur();

    return true
}

function replaceInnerText(elements, searchPattern, replaceTerm, flags) {
    let replaced = false;
    for (const element of elements) {
        if (element.innerText !== undefined) {
            if (element.innerText.match(searchPattern)) {
                replaced = replaceInTextNodes(element, searchPattern, replaceTerm, flags)
                if (flags === 'i') {
                    return replaced
                }
            }
        }
    }
    return replaced
}

function replaceInTextNodes(element, searchPattern, replaceTerm, flags) {
    let replaced = false;
    let textNodes = textNodesUnder(element)
    for (const node of textNodes) {
        let oldValue = node.nodeValue;
        node.nodeValue = node.nodeValue!.replace(searchPattern, replaceTerm);
        replaced = oldValue !== node.nodeValue;
        if (flags === 'i' && replaced) {
            return replaced
        }
    }
    return replaced
}

function textNodesUnder(element: Node) {
    let node: Node | null
    let nodes: Node[] = [];
    let walk = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    while (node = walk.nextNode()) {
        if (node) {
            nodes.push(node);
        }
    }
    return nodes;
}


function replaceHTMLInBody(body, searchPattern, replaceTerm) {
    body.innerHTML = body.innerHTML.replace(searchPattern, replaceTerm);
}

function replaceInInputs(inputs, searchPattern, replaceTerm, flags) {
    let replaced = false;
    let ko = usesKnockout();
    for (const input of inputs) {
        replaced = replaceInInput(input, searchPattern, replaceTerm, ko);
        if (flags === 'i' && replaced) {
            return replaced
        }
    }
    return replaced
}

function usesKnockout() {
    const script = Array.from(document.getElementsByTagName('script')).filter(s => s.src.indexOf('knockout.js') > -1)
    return script.length > 0
}

function getKnockoutValueChanger(id, newValue) {
    // NOTE - even though `id` is a string in the content script, it evaluates to the element on the page. Passing in an
    // element causes this to fail.
    return `(function () {
                var ko = requirejs('ko');
                ko.dataFor(${id}).value('${newValue}');
                ko.dataFor(${id}).valueUpdate = true;
                ko.dataFor(${id}).valueChangedByUser = true;
            })()`;
}


function replaceInputFields(searchPattern, replaceTerm, flags, visibleOnly) {
    const iframes = document.querySelectorAll('iframe');
    let allInputs: NodeListOf<HTMLInputElement | HTMLTextAreaElement> = document.querySelectorAll('input, textarea');
    const inputTypeFilter: string[] = [];
    if (visibleOnly) {
        inputTypeFilter.push("hidden")
    }
    let allInputsArr: Element[] = Array.from(allInputs).filter(({type}) => inputTypeFilter.indexOf(type) === -1);
    let replaced = replaceInInputs(allInputsArr, searchPattern, replaceTerm, flags)
    if (flags === 'i' && replaced) {
        return replaced
    }

    for (let iframeCount = 0; iframeCount < iframes.length; iframeCount++) {
        let iframe = iframes[0];
        if (iframe.src.match('^http://' + window.location.host) || !iframe.src.match('^https?')) {
            let iframeInputs: NodeListOf<HTMLInputElement | HTMLTextAreaElement> = document.querySelectorAll('input, textarea');
            let iframeInputsArr: Element[] = Array.from(iframeInputs).filter(({type}) => inputTypeFilter.indexOf(type) === -1);
            let replaced = replaceInInputs(iframeInputsArr, searchPattern, replaceTerm, flags)
            if (flags === 'i' && replaced) {
                return replaced
            }
        }
    }
}

function replaceHTML(searchPattern, replaceTerm, flags, visibleOnly) {
    const iframes: NodeListOf<HTMLIFrameElement> = document.querySelectorAll('iframe');
    let otherElements = document.body.getElementsByTagName('*');
    let otherElementsArr: Element[] = Array.from(otherElements).filter(el => !el.tagName.match(ELEMENT_FILTER));


    if (iframes.length === 0) {

        if (visibleOnly) {
            replaceVisibleOnly(otherElementsArr, searchPattern, replaceTerm, flags)
        } else {
            // when there are no iframes we are free to replace html directly in the body
            replaceHTMLInBody(document.body, searchPattern, replaceTerm)
        }

    } else {

        replaceHTMLInIframes(iframes, searchPattern, replaceTerm, flags, visibleOnly)
        if (visibleOnly) {
            replaceVisibleOnly(otherElementsArr, searchPattern, replaceTerm, flags)
        } else {
            // if there are iframes we take a cautious approach TODO - make this properly replace HTML
            replaceHTMLInElements(otherElementsArr, searchPattern, replaceTerm, flags);
        }
    }
}

function replaceHTMLInIframes(iframes, searchPattern, replaceTerm, flags, visibleOnly) {
    for (let iframeCount = 0; iframeCount < iframes.length; iframeCount++) {
        let iframe = iframes[0];
        if (iframe.src.match('^http://' + window.location.host) || !iframe.src.match('^https?')) {
            try {
                let content = iframe.contentDocument.documentElement;
                if (visibleOnly) {
                    replaceVisibleOnly(content, searchPattern, replaceTerm, flags);
                } else {
                    replaceHTMLInBody(content, searchPattern, replaceTerm)
                }
            } catch (e) {
                console.log('error replacing in iframe');
            }
        }
    }
}

function replaceHTMLInElements(elements: Element[], searchPattern, replaceTerm, flags) {
    // replaces in inner html per element in the document
    const filtered = Array.from(elements).filter(el => !el.tagName.match(ELEMENT_FILTER));
    let replaced = false;
    for (const element of filtered) {
        replaced = replaceInInnerHTML(element, searchPattern, replaceTerm);
        if (element.tagName.match(INPUT_TEXTAREA_FILTER)) {
            const ko = usesKnockout();
            replaced = replaceInInput(element, searchPattern, replaceTerm, ko);
        }
        //Replace Next should only match once
        if (flags === 'i' && replaced) {
            return
        }

    }
}

function replaceVisibleOnly(elements, searchPattern, replaceTerm, flags) {
    //replace inner texts first, dropping out if we have done a replacement and are not working globally
    const unhidden = elements.filter(el => el.type !== 'hidden' && el.style.display !== 'none');
    let replaced = replaceInnerText(unhidden, searchPattern, replaceTerm, flags);
    if (flags === 'i' && replaced) {
        return
    }
    // then replace inputs
    const inputs = unhidden.filter(el => el.tagName.match(INPUT_TEXTAREA_FILTER));
    let _ = replaceInInputs(inputs, searchPattern, replaceTerm, flags);

}


// Custom Functions

function replaceGmail(searchPattern, replaceTerm, flags) {
    let inputs = document.querySelectorAll('div[aria-label="Message Body"], input[name="subjectbox"]');
    replaceInInputs(inputs, searchPattern, replaceTerm, flags);
}

function tinyMCEPostEdit(searchPattern, replaceTerm, flags) {
    try {
        const mceIframe: HTMLIFrameElement = <HTMLIFrameElement>document.querySelectorAll('.mce-edit-area')[0].childNodes[0];
        const mceIframeBody = mceIframe.contentDocument!.documentElement.getElementsByTagName('body')[0];
        let inputs: HTMLElement[] = [];
        inputs.push(mceIframeBody);
        // TODO work out which function to use here
        replaceInnerText(inputs, searchPattern, replaceTerm, flags);
        mceIframeBody.focus();
    } catch (err) {
        console.log(err);
    }

}

function searchReplace(searchTerm, replaceTerm, flags, inputFieldsOnly, isRegex, visibleOnly) {

    const searchTermEscaped = !isRegex ? regExEscape(searchTerm) : searchTerm;
    const searchPattern = new RegExp(searchTermEscaped, flags);

    if (window.location.href.indexOf('wordpress') > -1) {
        if (document.querySelectorAll('.mce-tinymce').length) {
            tinyMCEPostEdit(searchPattern, replaceTerm, flags);
        }
    } else if (window.location.href.indexOf('mail.google.com') > -1) {
        if (window.location.hash.indexOf('compose') > -1 || window.location.hash.indexOf('#drafts') > -1 || window.location.hash.indexOf('#inbox') > -1) {
            replaceGmail(searchPattern, replaceTerm, flags)
        }
    } else if (inputFieldsOnly) {
        replaceInputFields(searchPattern, replaceTerm, flags, visibleOnly)
    } else {
        replaceHTML(searchPattern, replaceTerm, flags, visibleOnly)
    }

}

chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        let searchTerm;
        let replaceTerm;
        if (request.recover) {
            searchTerm = sessionStorage.getItem('searchTerm');
            replaceTerm = sessionStorage.getItem('replaceTerm');
            sendResponse({
                searchTerm: searchTerm,
                replaceTerm: replaceTerm
            });
        } else if (request.store) {
            sessionStorage.setItem('searchTerm', request.searchTerm);
            sessionStorage.setItem('replaceTerm', request.replaceTerm);
        } else if (request.searchTerm) {
            sessionStorage.setItem('searchTerm', request.searchTerm);
            sessionStorage.setItem('replaceTerm', request.replaceTerm);
            searchReplace(request.searchTerm, request.replaceTerm, request.flags, request.inputFieldsOnly, request.regex, request.visibleOnly);
            sendResponse({
                response: 'done'
            });
        }
    });