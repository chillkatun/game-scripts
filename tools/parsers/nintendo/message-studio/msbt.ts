import { encode as htmlEncode } from 'html-entities';

import { repeat, DataType } from '../../binary';
import { closeMarkup, FormatTree, isShiftCode, processShiftCode, ShiftControl } from './format';
import { LMS, processLabelBlock } from './lms';

type Message = Array<string | ShiftControl>;

interface Blocks {
	LBL1: string[];
	TSY1: number[];
	TXT2: Message[];
}

export class MSBT extends LMS<Blocks> {
	get entries() {
		return this.mapLabels(
			this.blocks.LBL1,
			this.blocks.TXT2?.map((message) => {
				return message.filter((part) => typeof part === 'string').join('');
			}),
		);
	}

	constructor(source: string | Buffer, tagFormatters: FormatTree = {}, encode = htmlEncode) {
		super(source, 'MsgStdBn', [3], {
			LBL1: processLabelBlock,
			TSY1: (reader) => {
				return repeat(reader.buffer.length / 4, () => reader.next(DataType.UInt32));
			},
			TXT2: (reader, encoding) => {
				return repeat(reader.next(DataType.UInt32), () => reader.next(DataType.UInt32)).map((offset) => {
					reader.seek(offset);

					const openMarkupTags: string[] = [];
					const message: Message = [];

					let string = '';
					let char = reader.next({ type: 'char', encoding });

					while (char !== '\0') {
						const code = char.codePointAt(0);

						if (isShiftCode(code)) {
							if (string) {
								message.push(string);
								string = '';
							}

							message.push(processShiftCode(code, reader, encoding, openMarkupTags, tagFormatters));
						} else {
							string += encode(char);
						}

						char = reader.next({ type: 'char', encoding });
					}

					if (string) {
						message.push(string);
					}

					if (openMarkupTags.length) {
						message.push(closeMarkup(openMarkupTags));
					}

					return message;
				});
			},
		});
	}
}
