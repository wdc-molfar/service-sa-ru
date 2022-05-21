
import json
import os
import io
import sys
import warnings
import traceback
import fasttext

warnings.filterwarnings("ignore", message=r"\[W033\]", category=UserWarning)

input_stream = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')

model_name = sys.argv[1]
model = fasttext.load_model(model_name)
    
    


def main(input_json):

    text = input_json["text"]
    predict = model.predict(text, k = 2)
    
    if (predict[0][0] == '__label__pos') and (predict[1][0] >= 0.9):
        emotion = "positive"
    elif (predict[0][0] == '__label__neg') and (predict[1][0] >= 0.9):
        emotion = "negative"
    else:
        emotion = "unrecognised"
    
    return {
                "emotion": emotion,
                "classes": {
                    "__label__pos": float(predict[1][0]),
                    "__label__neg": float(predict[1][1])
                }
            }

    


if __name__=='__main__':
    

    input_json = None
    for line in input_stream:
        
        # read json from stdin
        input_json = json.loads(line)
        
        try:
            
            output = main(input_json)
        except BaseException as ex:
            ex_type, ex_value, ex_traceback = sys.exc_info()            
            
            output = {"error": ''}           
            output['error'] += "Exception type : %s; \n" % ex_type.__name__
            output['error'] += "Exception message : %s\n" %ex_value
            output['error'] += "Exception traceback : %s\n" %"".join(traceback.TracebackException.from_exception(ex).format())
            
            
        
        output_json = json.dumps(output, ensure_ascii=False).encode('utf-8')
        sys.stdout.buffer.write(output_json)
        print()
